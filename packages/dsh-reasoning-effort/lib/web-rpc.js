// 宿主半边的页内 RPC 通道：把 `${channel}/<endpoint>` 挂到本插件 inject 的 webServer 上。
//
// 为什么不走 ctx.connection.rpc.handle（原先的写法）：内核
// @deepseek-ai/dsh-client-connection 的插件 `inject` 只有 ["credentials"]，而
// HostConnectionService 的 `rpc.handle → register()` 里要 `owner.webServer.register(route)`
// —— owner 正是**服务自己的 ctx**，`webServer` 不在它的注入清单里，cordis 隔离层直接抛
// `cannot get property without inject`。失败形态是最难查的那类**静默**：路由从未挂上，
// 页面 POST 落到静态处理器换来 405，控制台只留一行
// `Failed to load resource: 405 .../dsh-reasoning-effort/diagnose`，
// 而页内那句 rpc.call 被 try/catch 吞成 null ⇒ 表现成「诊断按钮点了没反应」。
// 内核自己的 /api 路由也是 `ctx.inject(["webServer"], …)` 里挂的（见同一个 apply()），
// 所以正解就是插件把通道挂到自己 inject 的 webServer 上，逐分支复刻 /api 的传输语义：
//   POST + application/json + {type:'client-request', rpcId, method, payload}
//     → handler(endpoint, payload, signal) → {type:'server-response', rpcId, result}
// 页内半边无需改动：它用的就是内核原生的 connection.rpc.call。
// 同款修复见 packages/dsh-pocket/lib/web-rpc.js。

/** endpoint 段字符（与 dsh-client-connection 的 ENDPOINT_SEGMENT_PATTERN 逐字对齐）。 */
const ENDPOINT_SEGMENT_PATTERN = /^[A-Za-z0-9_$.-]+$/;
/** 信封校验失败时的兜底 rpcId（与内核 INVALID_REQUEST_RPC_ID 对齐）。 */
const INVALID_REQUEST_RPC_ID = 'invalid-request';
/** 请求体上限：本通道只有 diagnose / store 两个小控制载荷。 */
const BODY_MAX = 1024 * 1024;
const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '::1']);

/** 从 `${channel}/<endpoint>` 取 endpoint；段非法（空/. /.. /越界字符）返回 undefined。 */
export function endpointFromPath(channel, pathname) {
    if (!pathname.startsWith(`${channel}/`))
        return undefined;
    const endpoint = pathname.slice(channel.length + 1);
    const segments = endpoint.split('/');
    if (segments.some((segment) => segment === '' || segment === '.' || segment === '..' || !ENDPOINT_SEGMENT_PATTERN.test(segment)))
        return undefined;
    return endpoint;
}

/** server-response 信封（字段与内核 fullResponse 对齐）。 */
export function serverResponseJson(rpcId, result) {
    return JSON.stringify({ type: 'server-response', rpcId, result });
}

/**
 * 失败信封。⚠ `error.details` 必须存在：页内 parseConnectionResponse 会校验
 * `isRecord(error.details)`，缺了它抛 `invalid server-response failure`，
 * 于是**连错误都被吞成 null**（正是本文件开头说的那类静默）。
 */
export function badRequestResult(rpcId, message) {
    return { ok: false, error: { code: 'bad-request', message, details: { issues: [{ message }] } } };
}

/**
 * 兜底信任栅栏：仅放行 loopback Host，拒 cross-site fetch 与 Origin 不匹配。
 * 新版内核优先用 connection.requestRejection（含浏览器 cookie 认证）。
 */
export function isTrustedLoopbackRequest(req) {
    const host = req.headers?.host;
    if (typeof host !== 'string' || host.length === 0)
        return false;
    const hostname = host.split(':')[0];
    if (!LOOPBACK_HOSTNAMES.has(hostname))
        return false;
    if (req.headers['sec-fetch-site'] === 'cross-site')
        return false;
    const origin = req.headers.origin;
    if (origin === undefined)
        return true;
    try {
        return new URL(origin).host === host;
    }
    catch {
        return false;
    }
}

function sendJson(res, status, body) {
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    res.end(text);
}

/** 读干请求体：超限返回 too-large，读流出错返回 error。 */
function readBody(req, maxBytes) {
    return new Promise((resolve) => {
        const declared = req.headers?.['content-length'];
        if (declared !== undefined && Number(declared) > maxBytes) {
            resolve({ kind: 'too-large' });
            req.resume?.();
            return;
        }
        const chunks = [];
        let size = 0;
        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > maxBytes) {
                resolve({ kind: 'too-large' });
                req.resume?.();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => resolve({ kind: 'ok', text: Buffer.concat(chunks).toString('utf8') }));
        req.on('error', () => resolve({ kind: 'error' }));
    });
}

/**
 * 构造 `${channel}` 的 prefix 路由（交给调用方 `ctx.effect(() => webServer.register(route))`）。
 *
 * 分支与内核 /api 的 rpcFetchHandler 一致：
 *   404（非 POST / 无合法 endpoint）、415（content-type）、400（非 JSON）、
 *   200 + server-response（信封非法 / method 与 endpoint 不匹配时是失败信封）、
 *   500（handler 抛错）。
 */
export function createChannelRoute({ channel, handler, connection, log }) {
    return {
        kind: 'prefix',
        path: channel,
        handler: async (req, res) => {
            // 必须持有 connection 本体并以**方法形式**调用 requestRejection：
            // 它是类方法，抽成裸函数再调会丢 this → 内部读 this.trustedHosts 抛错，
            // 于是任何请求都被判 forbidden（dsh-pocket 的 issue #117 踩过）。
            let rejection;
            if (typeof connection?.requestRejection === 'function') {
                try {
                    rejection = connection.requestRejection(req);
                }
                catch {
                    rejection = 403;
                }
            }
            else if (!isTrustedLoopbackRequest(req)) {
                rejection = 403;
            }
            if (rejection !== undefined) {
                res.writeHead(rejection, { 'content-type': 'text/plain; charset=utf-8' });
                res.end(rejection === 401 ? 'unauthorized' : 'forbidden');
                return;
            }

            const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
            const endpoint = endpointFromPath(channel, pathname);
            if (req.method !== 'POST' || endpoint === undefined) {
                res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
                res.end('not found');
                return;
            }
            const mediaType = req.headers?.['content-type']?.split(';', 1)[0]?.trim().toLowerCase();
            if (mediaType !== 'application/json') {
                res.writeHead(415, { 'content-type': 'text/plain; charset=utf-8' });
                res.end('content type must be application/json');
                return;
            }
            const body = await readBody(req, BODY_MAX);
            if (body.kind === 'too-large') {
                res.writeHead(413, { 'content-type': 'text/plain; charset=utf-8', connection: 'close' });
                res.end();
                return;
            }
            if (body.kind === 'error') {
                res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
                res.end('body is not JSON');
                return;
            }
            let envelope;
            try {
                envelope = JSON.parse(body.text);
            }
            catch {
                res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
                res.end('body is not JSON');
                return;
            }
            const rpcId = typeof envelope?.rpcId === 'string' && envelope.rpcId.length > 0 ? envelope.rpcId : INVALID_REQUEST_RPC_ID;
            const method = typeof envelope?.method === 'string' ? envelope.method : null;
            if (rpcId === INVALID_REQUEST_RPC_ID || method === null) {
                sendJson(res, 200, serverResponseJson(INVALID_REQUEST_RPC_ID, badRequestResult(INVALID_REQUEST_RPC_ID, 'invalid client-request message')));
                return;
            }
            if (method !== endpoint) {
                sendJson(res, 200, serverResponseJson(rpcId, badRequestResult(rpcId, `method ${JSON.stringify(method)} does not match endpoint ${JSON.stringify(endpoint)}`)));
                return;
            }
            // 客户端断开就不再等 handler（与内核 bridge 的 res.close → abort 一致）。
            const abort = new AbortController();
            res.on('close', () => {
                if (!res.writableEnded)
                    abort.abort();
            });
            try {
                const result = await handler(endpoint, envelope.payload, abort.signal);
                sendJson(res, 200, serverResponseJson(rpcId, result));
            }
            catch (error) {
                log?.error?.(`rpc ${endpoint} failed: ${error instanceof Error ? error.message : String(error)}`);
                res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
                res.end(`handler failure: ${String(error)}`);
            }
        },
    };
}

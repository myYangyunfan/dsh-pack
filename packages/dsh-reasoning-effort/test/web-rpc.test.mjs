// 页内 RPC 通道（宿主半边）的判据与反证。
//
// 背景：真机上 POST /dsh-reasoning-effort/diagnose 得到 405 —— 原先走内核的
// connection.rpc.handle，而那个 API 在这版内核里必抛（connection 插件的 inject 只有
// ["credentials"]，register() 却要 owner.webServer.register）。路由从未挂上，
// 页面 POST 落到静态处理器；页内 rpc.call 又把 HTTP 405 吞成 null ⇒ 「点了没反应」。
// 修法是把通道挂到本插件 inject 的 webServer 上，wire 协议与内核 /api 一致。
// 这里逐条钉住协议判据，并且每条都配反证（把判据拆掉，结论必须随之改变）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
    createChannelRoute,
    endpointFromPath,
    badRequestResult,
    serverResponseJson,
    isTrustedLoopbackRequest,
} from '../lib/web-rpc.js';

const CHANNEL = '/dsh-reasoning-effort';

/** 复刻内核 dsh-client-connection 的 parseConnectionResponse 判据（client.js:1288 起）。 */
function kernelParseResponse(value) {
    if (typeof value !== 'object' || value === null || value.type !== 'server-response' || typeof value.rpcId !== 'string') {
        throw new TypeError('connection: invalid server-response envelope');
    }
    const result = value.result;
    if (typeof result !== 'object' || result === null) throw new TypeError('connection: invalid server-response result');
    if (result.ok === true) return { rpcId: value.rpcId, ok: true, value: result.value };
    if (result.ok !== false || typeof result.error !== 'object' || result.error === null) {
        throw new TypeError('connection: invalid server-response result');
    }
    const error = result.error;
    const detailsOk = typeof error.details === 'object' && error.details !== null && !Array.isArray(error.details);
    if (typeof error.code !== 'string' || typeof error.message !== 'string' || !detailsOk) {
        throw new TypeError('connection: invalid server-response failure');
    }
    return { rpcId: value.rpcId, ok: false, error };
}

function mockReq({ method = 'POST', url = `${CHANNEL}/diagnose`, headers = {}, body = '' } = {}) {
    const req = new EventEmitter();
    req.method = method;
    req.url = url;
    req.headers = { host: '127.0.0.1:3080', 'content-type': 'application/json', ...headers };
    req.resume = () => {};
    queueMicrotask(() => {
        if (body !== '') req.emit('data', Buffer.from(body, 'utf8'));
        req.emit('end');
    });
    return req;
}

function mockRes() {
    const res = new EventEmitter();
    res.status = undefined;
    res.headers = undefined;
    res.body = '';
    res.writableEnded = false;
    res.writeHead = (status, headers) => {
        res.status = status;
        res.headers = headers;
    };
    res.write = () => true;
    res.end = (chunk) => {
        if (typeof chunk === 'string') res.body += chunk;
        else if (chunk) res.body += chunk.toString('utf8');
        res.writableEnded = true;
        res.emit('finish');
    };
    return res;
}

function envelope(method, payload, rpcId = 'rpc-1') {
    return JSON.stringify({ type: 'client-request', rpcId, method, payload });
}

async function call(route, reqOptions, handler = async () => ({ ok: true, value: { reached: true } }), connection) {
    const routeObj = route ?? createChannelRoute({ channel: CHANNEL, handler, connection });
    const req = mockReq(reqOptions);
    const res = mockRes();
    await routeObj.handler(req, res);
    return res;
}

// ---- endpointFromPath ----

test('endpointFromPath：合法 endpoint 取出来，非法段一律 undefined', () => {
    assert.equal(endpointFromPath(CHANNEL, `${CHANNEL}/diagnose`), 'diagnose');
    assert.equal(endpointFromPath(CHANNEL, `${CHANNEL}/store`), 'store');
    assert.equal(endpointFromPath(CHANNEL, `${CHANNEL}/a.b-c_d$e`), 'a.b-c_d$e');
    assert.equal(endpointFromPath(CHANNEL, `${CHANNEL}/a/b`), 'a/b');
    assert.equal(endpointFromPath(CHANNEL, CHANNEL), undefined, '通道根不是 endpoint');
    assert.equal(endpointFromPath(CHANNEL, `${CHANNEL}/`), undefined);
    assert.equal(endpointFromPath(CHANNEL, `${CHANNEL}/../x`), undefined);
    assert.equal(endpointFromPath(CHANNEL, `${CHANNEL}/a b`), undefined);
    assert.equal(endpointFromPath(CHANNEL, '/other/diagnose'), undefined);
});

test('反证：把段校验拆掉，`..` 与空段就会被当成合法 endpoint（判据确实在承重）', () => {
    const lax = (channel, pathname) => (pathname.startsWith(`${channel}/`) ? pathname.slice(channel.length + 1) : undefined);
    assert.equal(lax(CHANNEL, `${CHANNEL}/../x`), '../x', '宽松版会放过路径穿越样式的段');
    assert.equal(lax(CHANNEL, `${CHANNEL}/`), '', '宽松版会放过空段');
    assert.equal(endpointFromPath(CHANNEL, `${CHANNEL}/../x`), undefined, '我们的实现必须拦住');
    assert.equal(endpointFromPath(CHANNEL, `${CHANNEL}/`), undefined, '我们的实现必须拦住');
});

// ---- 路由形状 ----

test('路由形状：prefix + path = 通道号（内核 /api 用的是同一种 kind）', () => {
    const route = createChannelRoute({ channel: CHANNEL, handler: async () => ({ ok: true, value: null }) });
    assert.equal(route.kind, 'prefix');
    assert.equal(route.path, CHANNEL);
    assert.equal(typeof route.handler, 'function');
});

// ---- 方法 / 路径 / content-type / body ----

test('非 POST 与「无合法 endpoint」都回 404 not found（与内核 rpcFetchHandler 一致）', async () => {
    const viaGet = await call(null, { method: 'GET', url: `${CHANNEL}/diagnose` });
    assert.equal(viaGet.status, 404);
    const noEndpoint = await call(null, { url: CHANNEL });
    assert.equal(noEndpoint.status, 404);
});

test('content-type 不是 application/json ⇒ 415', async () => {
    const res = await call(null, { headers: { 'content-type': 'text/plain' }, body: envelope('diagnose', {}) });
    assert.equal(res.status, 415);
});

test('反证：content-type 判据承重 —— 拿掉它，同一个合法信封会被 handler 执行', async () => {
    // 请求本身完全合法（信封、endpoint、method 都对），唯一的问题只是媒体类型。
    // 所以只要 handler 没被执行，就说明拦住它的确实是这道判据。
    let called = false;
    const res = await call(
        null,
        { headers: { 'content-type': 'text/plain' }, body: envelope('diagnose', { provider: 'p', model: 'm' }) },
        async () => {
            called = true;
            return { ok: true, value: {} };
        },
    );
    assert.equal(res.status, 415);
    assert.equal(called, false, '415 之后绝不能走到 handler');
    assert.equal(JSON.parse(envelope('diagnose', { provider: 'p', model: 'm' })).method, 'diagnose', '信封本身是好的 ⇒ 只有媒体类型这道闸在拦');
});

test('body 不是 JSON ⇒ 400', async () => {
    const res = await call(null, { body: 'not json' });
    assert.equal(res.status, 400);
});

test('信封缺 rpcId / method ⇒ 200 + 兜底 rpcId 的失败信封（内核校验器能接受）', async () => {
    const res = await call(null, { body: JSON.stringify({ type: 'client-request', payload: {} }) });
    assert.equal(res.status, 200);
    const parsed = kernelParseResponse(JSON.parse(res.body));
    assert.equal(parsed.rpcId, 'invalid-request');
    assert.equal(parsed.ok, false);
});

test('method 与 endpoint 不匹配 ⇒ 失败信封回显原 rpcId', async () => {
    const res = await call(null, { url: `${CHANNEL}/diagnose`, body: envelope('store', {}, 'rpc-42') });
    const parsed = kernelParseResponse(JSON.parse(res.body));
    assert.equal(res.status, 200);
    assert.equal(parsed.rpcId, 'rpc-42');
    assert.equal(parsed.ok, false);
    assert.match(parsed.error.message, /does not match endpoint/);
});

// ---- 成功路径 ----

test('成功：handler 收到 (endpoint, payload)，响应是 rpcId 回显的成功信封', async () => {
    const seen = [];
    const res = await call(
        null,
        { url: `${CHANNEL}/diagnose`, body: envelope('diagnose', { provider: 'deepseek', model: 'deepseek-v4-pro' }, 'rpc-7') },
        async (endpoint, payload) => {
            seen.push([endpoint, payload]);
            return { ok: true, value: { provider: payload.provider } };
        },
    );
    assert.equal(res.status, 200);
    assert.deepEqual(seen, [['diagnose', { provider: 'deepseek', model: 'deepseek-v4-pro' }]]);
    const parsed = kernelParseResponse(JSON.parse(res.body));
    assert.equal(parsed.rpcId, 'rpc-7', 'rpcId 必须原样回显，否则页内会抛 rpcId mismatch');
    assert.deepEqual(parsed.value, { provider: 'deepseek' });
});

test('handler 抛错 ⇒ 500（且不把异常塞进信封假装成功）', async () => {
    const res = await call(null, { body: envelope('diagnose', {}) }, async () => {
        throw new Error('boom');
    });
    assert.equal(res.status, 500);
    assert.match(res.body, /handler failure/);
});

test('content-length 超上限 ⇒ 413，且不读 body', async () => {
    const res = await call(null, { headers: { 'content-length': String(2 * 1024 * 1024) }, body: envelope('store', {}) });
    assert.equal(res.status, 413);
});

// ---- 信任栅栏 ----

test('栅栏：Host 不是 loopback ⇒ 403', async () => {
    const res = await call(null, { headers: { host: 'evil.example.com' }, body: envelope('diagnose', {}) });
    assert.equal(res.status, 403);
});

test('栅栏：sec-fetch-site: cross-site ⇒ 403（即使 Host 是 loopback）', async () => {
    const res = await call(null, { headers: { 'sec-fetch-site': 'cross-site' }, body: envelope('diagnose', {}) });
    assert.equal(res.status, 403);
});

test('栅栏：Origin 与 Host 不同源 ⇒ 403，同源放行', () => {
    const origins = { origin: 'http://127.0.0.1:3080' };
    assert.equal(isTrustedLoopbackRequest({ headers: { host: '127.0.0.1:3080', ...origins } }), true);
    assert.equal(isTrustedLoopbackRequest({ headers: { host: '127.0.0.1:3080', origin: 'http://evil.example.com' } }), false);
    assert.equal(isTrustedLoopbackRequest({ headers: {} }), false, '缺 Host 不能放行');
});

test('connection.requestRejection 可用时优先用它（401 原样透出）', async () => {
    const res = await call(null, { body: envelope('diagnose', {}) }, undefined, { requestRejection: () => 401 });
    assert.equal(res.status, 401);
    assert.equal(res.body, 'unauthorized');
});

test('反证（dsh-pocket issue #117）：requestRejection 必须以方法形式调用，丢了 this 会误判 forbidden', async () => {
    class FakeConnection {
        constructor() {
            this.trustedHosts = ['127.0.0.1:3080'];
        }
        requestRejection(req) {
            if (!this.trustedHosts.includes(req.headers.host)) return 403;
            return undefined;
        }
    }
    const connection = new FakeConnection();
    // 正确姿势（我们的实现）：方法形式 → loopback 请求放行。
    const ok = await call(null, { body: envelope('diagnose', {}) }, undefined, connection);
    assert.equal(ok.status, 200, '方法形式调用必须放行 loopback 请求');
    // 反证：抽成裸函数再调，this 丢失 → 读 this.trustedHosts 抛错 → 被判 403。
    const detached = connection.requestRejection;
    assert.throws(() => detached({ headers: { host: '127.0.0.1:3080' } }), /trustedHosts/);
});

// ---- 失败信封的 details 是承重的 ----

test('反证：失败信封缺 error.details 会被内核校验器拒（details 不是装饰）', () => {
    const withoutDetails = { type: 'server-response', rpcId: 'rpc-1', result: { ok: false, error: { code: 'not-found', message: 'x' } } };
    assert.throws(() => kernelParseResponse(withoutDetails), /invalid server-response failure/);
    const ours = { type: 'server-response', rpcId: 'rpc-1', result: badRequestResult('rpc-1', 'x') };
    assert.equal(kernelParseResponse(ours).ok, false, '带 details 的失败信封必须能被解析');
});

test('反证：ok:true 的信封不会因为 details 缺失而受影响（只有失败分支需要 details）', () => {
    const parsed = kernelParseResponse(JSON.parse(serverResponseJson('rpc-9', { ok: true, value: 7 })));
    assert.equal(parsed.value, 7);
    assert.equal(parsed.rpcId, 'rpc-9');
});

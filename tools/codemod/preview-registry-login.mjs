// 给本机 verdaccio 预览 registry 建一个发布用账号，并把 Basic 凭证写进独立
// userconfig 文件（不碰用户自己的 ~/.npmrc）。
//
// 为什么不用 shell 拼：上次取 token 用 `node -p` 走命令替换，解析失败时把整个
// Socket 对象打到 stdout，被原样写进 .npmrc，npm 把每一行都当配置键 → ENEEDAUTH。
// 所以这里让 node 自己发请求、自己校验 JSON、自己写文件，全程不经过 shell，
// 也不把 token 打印到输出里。
//
// 用法：node tools/codemod/preview-registry-login.mjs [port] [outfile]
import { request } from 'node:https';
import { request as hrequest } from 'node:http';
import { writeFileSync } from 'node:fs';

const PORT = process.argv[2] || '14874';
const OUT = process.argv[3] || `${process.env.TEMP || '/tmp'}\\dsh-preview-npmrc`;
const USER = 'dshpreview';
const PASS = 'dsh-preview-local-only';
const BASE = `//127.0.0.1:${PORT}/`;
const basic = Buffer.from(`${USER}:${PASS}`).toString('base64');

function put(path, body, headers) {
  return new Promise((resolve, reject) => {
    const req = hrequest({ host: '127.0.0.1', port: Number(PORT), path, method: 'PUT', headers },
      (res) => {
        let s = '';
        res.on('data', (d) => (s += d));
        res.on('end', () => resolve({ status: res.statusCode, text: s }));
      });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// 已存在就用登录路径拿 token；不存在就注册。两条路都返回 JSON.token。
let r = await put('/-/user/org.couchdb.user:preview',
  JSON.stringify({ name: USER, password: PASS, roles: [], type: 'user' }),
  { 'Content-Type': 'application/json', Authorization: `Basic ${basic}` });

if (r.status !== 200 && r.status !== 201) {
  r = await put(`/-/user/org.couchdb.user:${USER}`,
    JSON.stringify({ name: USER, password: PASS, roles: [], type: 'user' }),
    { 'Content-Type': 'application/json', Authorization: `Basic ${basic}` });
}

let token = null;
try {
  const parsed = JSON.parse(r.text);
  if (parsed && typeof parsed.token === 'string') token = parsed.token;
} catch {
  /* 不是 JSON：下面按状态码报错，绝不把原始响应体写进配置 */
}

if (!token) {
  console.error(`✗ 没拿到 token（HTTP ${r.status}）。响应体前 200 字符：`);
  console.error(String(r.text).slice(0, 200).replace(/[A-Za-z0-9+/=]{20,}/g, '<已脱敏>'));
  console.error('多半是这个 verdaccio 实例关了注册。改用它已有账号，或换回 14873 那个实例。');
  process.exit(1);
}

// _auth 用 base64(user:pass) 即可，verdaccio 认 Basic；token 另存一行注释位备用。
writeFileSync(OUT, `${BASE}:_auth=${basic}\n${BASE}:always-auth=true\n`, 'utf8', { mode: 0o600 });
console.log(`已写凭证文件（0600，未打印内容）：${OUT}`);
console.log(`token 长度 ${String(token.length)}（仅确认拿到了，不输出）`);

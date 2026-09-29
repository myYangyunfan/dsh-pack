// 起本机「预览 registry」（verdaccio）：把 packages/ 全量按 0.2.x 发上去，
// 就能在官方客户端里只装一条 @dsh-pack/all 而装齐全部成员。
//
// 为什么要有这个脚本：客户端装 @dsh-pack/all 时，它的 32 个依赖是**按名**解析的，
// 只有 registry 上有它们才装得动（本地路径 tarball 那条路走不到这里）。
//
// 两个坑写进代码里，别再踩：
//   · `max_users: -1` 在 verdaccio 5 里是「关闭注册」而不是「不限量」——上一个版本
//     这么写，login 脚本当场吃 409 user registration disabled。
//   · 两个监听口（14873/14874）共用同一份 storage：对其中一个 unpublish，两个口
//     一起 404。用户 ~/.npmrc 里 @dsh-pack 指向 14874，所以装与发都以 14874 为准。
//
// 用法：node tools/preview-registry.mjs [--ports=14873,14874] [--storage=<目录>]
// 起好之后（另开一个终端）：
//   node tools/codemod/preview-registry-login.mjs 14874
//   node tools/codemod/publish-local-preview.mjs http://127.0.0.1:14874 --purge --userconfig="$TEMP/dsh-preview-npmrc"
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const argOf = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const PORTS = (argOf('ports') || '14873,14874').split(',').map((p) => p.trim()).filter(Boolean);
const STORAGE = (argOf('storage') || join(REPO, '.tmp-preview-registry', 'storage')).replace(/\\/g, '/');
const CONF_DIR = dirname(STORAGE);
mkdirSync(STORAGE, { recursive: true });

const config = `# 由 tools/preview-registry.mjs 生成，别手改。
storage: ${STORAGE}

auth:
  htpasswd:
    file: ${STORAGE}/htpasswd
    # 注意：-1 是「关闭注册」，不是「不限量」。
    max_users: 1000

uplinks:
  npmjs:
    url: https://registry.npmjs.org/

packages:
  # @dsh-pack 不设 proxy：本地没发出去的包必须响亮失败，不许偷偷去公网取。
  '@dsh-pack/*':
    access: $all
    publish: $authenticated
    unpublish: $authenticated
  '**':
    access: $all
    publish: $authenticated
    unpublish: $authenticated
    proxy: npmjs

listen:
${PORTS.map((p) => `  - 127.0.0.1:${p}`).join('\n')}

log:
  type: stdout
  format: pretty
  level: warn

web:
  enable: false
`;
const confPath = join(CONF_DIR, 'config.yaml');
writeFileSync(confPath, config);

const verdaccioBin = (() => {
  const cand = [
    process.env.VERDACCIO_BIN,
    join(REPO, 'node_modules', 'verdaccio', 'bin', 'verdaccio'),
  ].filter(Boolean);
  for (const c of cand) if (existsSync(c)) return { cmd: process.execPath, args: [c] };
  // 没有本地安装就交给 npx（它会把 verdaccio@5 放进自己的缓存）。
  return { cmd: 'npx', args: ['--yes', 'verdaccio@5'], shell: process.platform === 'win32' };
})();

console.log(`config: ${confPath}`);
console.log(`storage: ${STORAGE}`);
console.log(`listen: ${PORTS.map((p) => `http://127.0.0.1:${p}/`).join('  ')}`);
console.log(`启动：${verdaccioBin.cmd} ${verdaccioBin.args.join(' ')} --config ${confPath}\n`);
console.log('起好之后（另开一个终端）：');
console.log(`  node tools/codemod/preview-registry-login.mjs ${PORTS[PORTS.length - 1]}`);
console.log(`  node tools/codemod/publish-local-preview.mjs http://127.0.0.1:${PORTS[PORTS.length - 1]} --purge --userconfig="$TEMP/dsh-preview-npmrc"\n`);

const child = spawn(verdaccioBin.cmd, [...verdaccioBin.args, '--config', confPath], {
  stdio: 'inherit',
  shell: verdaccioBin.shell === true,
});
child.on('exit', (code) => process.exit(code ?? 0));

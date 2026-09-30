'use strict';

// ---------------------------------------------------------------------------
// kernel-shadow —— 本地 `@deepseek-ai/*` 拷贝不得遮蔽内核。
//
// 为什么是 error：
//   插件的宿主半边是**按绝对路径**从工作区加载的（profile 补丁层里的
//   `file:///…/packages/<pkg>/lib/index.js`），所以 Node 的常规解析会先看
//   `packages/<pkg>/node_modules/`，**再**才轮到内核的安装作用域链接表。
//   只要该目录下存在一份 `@deepseek-ai/*`，它就赢——而工作区 devDependencies
//   钉的是老版本（实测 `@deepseek-ai/schemastery@3.18.1`，内核是 3.18.4）。
//
//   实例（2026-09-30，官方客户端 0.2.0-rc.2）：
//     dsh-better-sidebar 的 lib/index.js 第 89 行 `z.boolean().volatile()`
//     ↓ 老 schemastery 没有 `.volatile`（那是本仓 fork 的扩展）
//     → import 期抛 `z.boolean(...).volatile is not a function`
//     → 条目拿到 **fiber=NO-FIBER**
//     → dsh-client-modules 的 processOne() 直接 `continue`（`entry.fiber === void 0`）
//     → 该包**不进客户端启动图**，`ctx.inject(...)` 永不触发
//     → 官方客户端里表现为「右栏没有工作台标签、设置里也没有这一节」，
//       而**启动日志干净、没有任何报错**。
//
//   这与「声明了 dsh.client 却没有 exports['./client']」是同一类砖化路径，
//   因此按 P0 拦：坏起来的形态是静默缺功能，不是崩溃。
//
// 判据只有一条：某个包自己的 node_modules 下存在 `@deepseek-ai/<name>`。
// 运行时这些包一律由内核供给（AGENTS.md 契约 5：`@deepseek-ai/*` 只允许出现在
// peerDependencies），本地那份永远只是遮蔽物。
//
// 严重度定为 warn 而不是 error：这是 **node_modules 环境产物**，不是签入源码的
// 性质——`pnpm install` 会按 devDependencies 重建它，CI 上又可能根本没有
// node_modules（那时本检查无事可报）。用 error 会让门禁随环境随机变红，而
// warn 既能在每次审计里把它摆到台面上，又不会误拦发布。要恢复成硬门，得先让
// 成员包的 devDependencies 不再钉住老版本内核包。
// ---------------------------------------------------------------------------

const fs = require('node:fs');
const path = require('node:path');

const { detectPackRoot, finding } = require('./shared');

const CHECK = 'kernel-shadow';

/** 影子目录的父路径：`<pkg>/node_modules/@deepseek-ai`。 */
function shadowDirOf(pkgDir) {
  return path.join(pkgDir, 'node_modules', '@deepseek-ai');
}

function run(ctx = {}) {
  const pack = ctx.pack || detectPackRoot();
  const findings = [];
  if (!pack.exists) return findings;

  for (const pkg of pack.packages) {
    const shadow = shadowDirOf(pkg.dir);
    if (!fs.existsSync(shadow)) continue;

    let names;
    try {
      names = fs.readdirSync(shadow).filter((n) => !n.startsWith('.'));
    } catch {
      continue;
    }
    if (names.length === 0) continue;

    // 逐个读版本，报告里点名，方便直接判断要不要删。
    const detail = names.map((name) => {
      const manifestPath = path.join(shadow, name, 'package.json');
      try {
        const version = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).version;
        return `${name}@${version ?? '?'}`;
      } catch {
        return name;
      }
    });

    findings.push(finding(
      CHECK,
      'warn',
      `本地存在 ${names.length} 份 @deepseek-ai 拷贝（${detail.slice(0, 6).join(', ')}${detail.length > 6 ? ', …' : ''}）`
      + '——插件按绝对路径加载时它们会遮蔽内核版本；'
      + '老版本一旦缺少插件用到的扩展（例如 schemastery 的 .volatile()），'
      + '宿主半边会在 import 期抛错 → fiber=NO-FIBER → 整包静默不进客户端启动图。'
      + `删除该目录即可：${path.relative(pack.root, shadow)}`
      + '（注意 pnpm install 会重建，需在安装后复查）',
      pkg.label,
    ));
  }

  return findings;
}

module.exports = { run, CHECK };

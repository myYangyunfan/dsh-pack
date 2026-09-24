#!/usr/bin/env node
// Stage 5：把 assets/plugins 物理搬到 packages/，并删除自制壳时代的死重。
//
// 为什么做成脚本而不是一串手敲的 git 命令：
//   ① 这一步里「删除」是不可逆动作，必须先能 `--dry-run` 看清楚要动什么再落地；
//   ② 计划要求 Stage 5 是**一个原子提交**（git mv 与工作区文件落地之间仓库是坏的），
//      所以顺序必须固定、可重放；
//   ③ 必须**保住用户未提交的在制品**：本仓库工作区里有用户自己改的 41 个文件与
//      299 个 vendor 删除，绝不能被 reset/checkout/clean 吃掉。
//
// 用法：
//   node tools/codemod/restructure-to-packages.mjs --dry-run   # 只报告，不动任何东西
//   node tools/codemod/restructure-to-packages.mjs --apply     # 真做（做完请自查 git status）
//
// 默认拒绝执行：如果检测到 tools/audit 或插件目录在近 3 分钟内还在被写，
// 说明有并发改动，会拒绝（--force 覆盖）。避免把别人正在写的文件搬走。

import { existsSync, readdirSync, statSync, rmSync, mkdirSync, cpSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PLUGINS = join(REPO, 'dsh-desktop', 'assets', 'plugins');
const PACKAGES = join(REPO, 'packages');
const APPLY = process.argv.includes('--apply');
const DRY = !APPLY;
const force = process.argv.includes('--force');

const log = (...a) => console.log(...a);
const plan = { mv: [], copy: [], rm: [], keep: [], skip: [] };

function git(...args) {
  return execFileSync('git', args, { cwd: REPO, encoding: 'utf8' }).trim();
}
function isTracked(rel) {
  try {
    return git('ls-files', '--error-unmatch', rel).length > 0;
  } catch {
    return false;
  }
}

// ---- 并发写保护：有人在写就别动 ----------
function recentlyWritten(dir, seconds = 180) {
  if (!existsSync(dir)) return false;
  const cutoff = Date.now() - seconds * 1000;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    try {
      if (statSync(full).isFile() && statSync(full).mtimeMs > cutoff) return true;
      if (statSync(full).isDirectory()) {
        for (const sub of readdirSync(full)) {
          const f2 = join(full, sub);
          try {
            if (statSync(f2).isFile() && statSync(f2).mtimeMs > cutoff) return true;
          } catch {}
        }
      }
    } catch {}
  }
  return false;
}
if (!force && (recentlyWritten(PLUGINS) || recentlyWritten(join(REPO, 'tools', 'audit')))) {
  log('✗ 检测到 3 分钟内仍有文件在被写入（插件目录或 tools/audit）。');
  log('  这说明还有并发改动，搬目录会把正在写的文件搞丢。等它完成后再跑，或 --force 强行。');
  process.exit(1);
}

// ---- 1. 用户未提交的在制品：先确认，绝不覆盖 ----
log('== 1. 在制品体检（这个脚本永远不 reset/checkout/clean）==');
const status = git('status', '--porcelain');
const dirty = status.split('\n').filter(Boolean);
const modified = dirty.filter((l) => /^ M/.test(l));
const deleted = dirty.filter((l) => /^ D/.test(l));
const untracked = dirty.filter((l) => /^\?\?/.test(l));
log(`  未提交修改 ${modified.length} 个、未提交删除 ${deleted.length} 个、未跟踪 ${untracked.length} 个`);
if (modified.length) {
  log('  ⚠ 有未提交修改。本脚本不碰它们，但**建议先提交或 stash -u 再搬目录**，');
  log('     否则 git mv 会把它们的改动一起带进 Stage 5 那个提交里。');
  for (const l of modified.slice(0, 8)) log('      ' + l.slice(3));
  if (modified.length > 8) log(`      …共 ${modified.length} 个`);
}

// ---- 2. 搬 35 个插件到 packages/ ----
log('\n== 2. 插件目录搬家 ==');
const dirs = existsSync(PLUGINS) ? readdirSync(PLUGINS).filter((d) => existsSync(join(PLUGINS, d, 'package.json'))) : [];
for (const d of dirs.sort()) {
  const from = join(PLUGINS, d);
  const to = join(PACKAGES, d);
  if (existsSync(to)) {
    plan.skip.push(`packages/${d} 已存在，跳过`);
    continue;
  }
  plan.mv.push({ from: relative(REPO, from), to: relative(REPO, to) });
}
log(`  待搬 ${plan.mv.length} 个：${plan.mv.map((m) => m.to.replace('packages/', '')).join(', ').slice(0, 200)}`);

// ---- 3. 删除自制壳死重（只删【已跟踪】的；未跟踪的本地产物一律不碰）----
log('\n== 3. 死重删除清单 ==');
const REMOVE_TRACKED = [
  'dsh-tauri',
  'dsh-desktop/scripts',
  'dsh-desktop/vendor',
  'dsh-desktop/dist',
  'dsh-desktop/package-lock.json',
  'dsh-desktop/balance.js',
  'dsh-desktop/balance-scheduler.js',
  'dsh-desktop/session-watcher.js',
  'dsh-desktop/wsl-backend.js',
  'dsh-desktop/watchdog.js',
  'dsh-desktop/renderer-recovery.js',
  'dsh-desktop/plugin-guard.js',
  'dsh-desktop/profile-bundle-heal.js',
  'dsh-desktop/profile-patch-heal.js',
  'dsh-desktop/profile-module-heal.js',
  'dsh-desktop/profile-manifest.js',
  'dsh-desktop/patch-row-heal.js',
  'dsh-desktop/assets/agent-presets',
  'landing',
  'research',
  'openclaw-dsh-bridge',
];
for (const rel of REMOVE_TRACKED) {
  const abs = join(REPO, rel);
  if (!existsSync(abs)) {
    plan.keep.push(`${rel}（已不存在）`);
    continue;
  }
  if (!isTracked(rel) && !readdirHasTracked(abs)) {
    // 未跟踪 = 用户本地产物（大文件、exe、zip、node_modules）。绝不自动删。
    plan.keep.push(`${rel}：未跟踪 → **本脚本不删**，请人工确认后再清`);
    continue;
  }
  plan.rm.push(rel);
}
function readdirHasTracked(abs) {
  try {
    return git('ls-files', '--', relative(REPO, abs)).length > 0;
  } catch {
    return false;
  }
}
log(`  待删（已跟踪）${plan.rm.length} 个：`);
for (const r of plan.rm) log('      ' + r);
log(`  明确不碰 ${plan.keep.length} 项：`);
for (const k of plan.keep) log('      ' + k);

// ---- 4. 报告 ----
log('\n' + '='.repeat(64));
log(DRY ? '模式：DRY-RUN（什么都没改）。确认无误后加 --apply' : '模式：APPLY');
log(`  git mv   ${plan.mv.length}`);
log(`  删除跟踪 ${plan.rm.length}`);
log(`  不碰     ${plan.keep.length}`);
log(`  跳过     ${plan.skip.length}`);

if (DRY) {
  writeFileSync(join(REPO, 'tools', 'codemod', '.restructure-plan.json'), JSON.stringify(plan, null, 2));
  log('\n计划已写到 tools/codemod/.restructure-plan.json 供复核。');
  process.exit(0);
}

// ---- 5. 真做：mv → 删 ----
log('\n== 应用 ==');
if (!existsSync(PACKAGES)) mkdirSync(PACKAGES, { recursive: true });
let moved = 0;
for (const m of plan.mv) {
  git('mv', m.from, m.to);
  moved += 1;
}
log(`  git mv 完成 ${moved} 个`);
for (const rel of plan.rm) {
  try {
    git('rm', '-r', '--quiet', rel);
    log('  git rm  ' + rel);
  } catch (e) {
    log('  ✗ git rm 失败 ' + rel + '：' + String(e.message).split('\n')[0]);
  }
}
log('\n下一步：');
log('  1) 自查 `git status` —— 确认用户原有那 ' + modified.length + ' 个未提交修改仍在原位');
log('  2) 跑 `node tools/itest/boot-desktop-profile.mjs --job=j1` 验证搬家后仍能组合');
log('  3) 跑 `node tools/audit/index.js`（注意 packRoot 现在应自动选中 packages/）');
log('  4) 一个原子提交：chore(restructure): 自制壳退役，仓库转为 DSH Pack 插件包');

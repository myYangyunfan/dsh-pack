// fence.js —— 写围栏（宿主半边还原路由的守门人）
//
// 语义自 dsh-tauri/src-tauri/crates/fence/src/lib.rs（171 行，纯 std 实现）逐条
// 移植，保证壳退役后行为不静默改变：
//   · 组件级清洗：统一分隔符、消解 `.`/`..`，不触碰文件系统（目标可能不存在）；
//   · 按路径**组件**对齐比较，同前缀字符串但组件不对齐（work vs work-private）不放行；
//   · 不同盘符直接拒绝；
//   · 刻意不做大小写折叠：Windows 大小写变体一律 fail-closed 拒绝
//     （Rust 侧 case_variant_currently_rejected_conservatively 钉的就是这条）。
// 空围栏拒绝一切（含相对路径）。

import { isAbsolute, resolve, sep } from "node:path";

/** Fence.ensure 的越界错误（code 恒为 E_FENCE_ROOT，供路由层原样回给客户端）。 */
export class FenceError extends Error {
  constructor(message) {
    super(message);
    this.name = "FenceError";
    this.code = "E_FENCE_ROOT";
  }
}

/** 组件级清洗：消解 `.` 与 `..`、归一分隔符（等价 Rust 的 clean()）。 */
export function clean(p) {
  return resolve(String(p ?? ""));
}

export class Fence {
  /** @param {Iterable<string>} roots 允许写入的根集合（构造时即清洗）。 */
  constructor(roots) {
    this.roots = [...(roots || [])].map((r) => clean(r));
  }

  /** 路径是否落在任一 root 内（含 root 本身）。 */
  contains(target) {
    const t = clean(target);
    return this.roots.some((r) => {
      if (t === r) return true;
      // 组件对齐前缀：root 必须是「完整一段」的开头，work-x 不算 work 的子路径。
      const prefix = r.endsWith(sep) ? r : r + sep;
      return t.startsWith(prefix);
    });
  }

  /**
   * 断言式访问：越界抛 E_FENCE_ROOT（错误码口径与 contracts/error-codes.md §4
   * 一致），通过则返回清洗后的路径。
   */
  ensure(target) {
    const t = clean(target);
    if (!this.contains(t)) throw new FenceError("[E_FENCE_ROOT] 路径越界: " + String(target));
    return t;
  }
}

/**
 * 路径合法性（不含 shell 元字符黑名单，口径同自制壳 commands/file.rs）：
 * 必须绝对路径，且不含引号 / NUL / 控制字符。
 */
export function ensureSaneAbsolute(path) {
  const p = String(path ?? "");
  if (!p || !isAbsolute(p)) return "路径必须是绝对路径";
  if (p.includes('"') || p.includes("\0")) return "路径含非法字符";
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(p)) return "路径含非法字符";
  return "";
}

// @deepseek-ai/dsh-openclaw-bridge/lib/core/logs.js
// 插件日志落盘（开发指南铁律⑫）：~/.dsh/openclaw-bridge/logs/<channel>.log，
// 单文件 1MB 轮转（超出后旧文件滚动为 .1）。消息行截断 4000 字符防失控。
import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

const MAX_BYTES = 1024 * 1024;
const MAX_LINE = 4000;

/**
 * 创建按渠道落盘的日志器。
 * @param {string} dir   日志目录（如 ~/.dsh/openclaw-bridge/logs）
 * @param {string} channel 渠道 id（wechat / feishu / qq / bridge）
 * @returns {{ info: Function, warn: Function, error: Function, file: string }}
 */
export function createChannelLogger(dir, channel) {
  const file = join(dir, channel + ".log");

  function rotateIfNeeded() {
    try {
      if (existsSync(file) && statSync(file).size > MAX_BYTES) {
        const bak = file + ".1";
        rmSync(bak, { force: true }); // Windows 下 rename 目标存在会失败，先删
        renameSync(file, bak);
      }
    } catch {
      // 轮转失败不影响运行
    }
  }

  function write(level, msg) {
    try {
      mkdirSync(dir, { recursive: true });
      rotateIfNeeded();
      const line = new Date().toISOString() + " [" + level + "] " + String(msg).slice(0, MAX_LINE) + "\n";
      // appendFileSync 以追加模式写入（日志只增不减，不做原子写——可容忍小概率交错）
      appendFileSync(file, line);
    } catch {
      // 日志失败绝不抛给业务
    }
  }

  return {
    info: (msg) => write("info", msg),
    warn: (msg) => write("warn", msg),
    error: (msg) => write("error", msg),
    file,
  };
}
// @deepseek-ai/dsh-openclaw-bridge/lib/core/qrcode.js
// 本地二维码生成（零依赖）：
//   - vendor 了 MIT 许可的 qrcode-generator（Kazuhiko Arase, 见同目录 qrcode-vendor.cjs 头部许可证）
//   - 输出 SVG 字符串，供 /openclaw-bridge/qr 路由本地渲染二维码
// 目的（修复⑤）：替换 client 直连第三方 https://api.qrserver.com 的方案——
//   去掉外网依赖、二维码内容不外泄给第三方、内网也可用。
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const QRCode = require("./qrcode-vendor.cjs");

const DEFAULT_EC = "M"; // 默认纠错级别：M 级在容量与容错间折中

/**
 * 生成二维码 SVG（含静区）。
 * @param {string} text 要编码的内容（如微信登录 URL）
 * @param {{size?:number, margin?:number, ecLevel?:'L'|'M'|'Q'|'H', light?:string, dark?:string}} opts
 * @returns {string} 可直接内联进 <img src=...> 或 <object> 的 SVG 文档
 */
export function qrSvg(text, { size = 220, margin = 2, ecLevel = DEFAULT_EC, light = "#ffffff", dark = "#000000" } = {}) {
  const data = String(text || "").trim();
  if (!data) throw new Error("qr: empty payload");
  if (data.length > 4096) throw new Error("qr: payload too large");
  const qr = QRCode(0, ecLevel); // type 0 = 自动选择最小版本
  qr.addData(data, "Byte");
  qr.make(); // 超出容量时抛 "code length overflow"
  const n = qr.getModuleCount();
  const total = n + margin * 2;
  const cells = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) {
        cells.push('<rect x="' + (c + margin) + '" y="' + (r + margin) + '" width="1" height="1"/>');
      }
    }
  }
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + total + " " + total +
    '" width="' + size + '" height="' + size + '" shape-rendering="crispEdges" role="img" aria-label="QR code">' +
    '<rect width="' + total + '" height="' + total + '" fill="' + light + '"/>' +
    cells.join("") +
    "</svg>"
  );
}
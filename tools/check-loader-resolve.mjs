import fs from "node:fs";

// Let's check node_modules/@deepseek-ai/cordis-plugin-loader/lib/index.js
const loaderFile = "node_modules/@deepseek-ai/cordis-plugin-loader/lib/index.js";
if (fs.existsSync(loaderFile)) {
  const code = fs.readFileSync(loaderFile, "utf8");
  const lines = code.split("\n");
  const match = lines.filter(l => l.includes("resolve(") || l.includes("import(") || l.includes("require("));
  console.log("Matching loader lines:\n", match.slice(0, 30).join("\n"));
}

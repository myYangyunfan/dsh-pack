import fs from "node:fs";
import path from "node:path";

const packagesDir = "packages";
const externalDeps = new Map();

for (const pkgName of fs.readdirSync(packagesDir)) {
  const pkgJsonPath = path.join(packagesDir, pkgName, "package.json");
  if (!fs.existsSync(pkgJsonPath)) continue;
  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
  if (pkg.dependencies) {
    for (const [dep, ver] of Object.entries(pkg.dependencies)) {
      if (!dep.startsWith("@dsh-pack/") && !dep.startsWith("@deepseek-ai/")) {
        externalDeps.set(dep, ver);
      }
    }
  }
}

console.log("External dependencies needed by plugins:");
console.log(JSON.stringify(Object.fromEntries(externalDeps), null, 2));

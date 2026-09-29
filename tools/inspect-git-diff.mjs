import { execSync } from "node:child_process";
import fs from "node:fs";

try {
  const diff = execSync("git diff HEAD tools/audit/", { encoding: "utf8" });
  fs.writeFileSync("tools/_audit_diff.txt", diff, "utf8");
} catch (e) {
  fs.writeFileSync("tools/_audit_diff.txt", "Error: " + e.message, "utf8");
}

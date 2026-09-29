import { execSync } from "node:child_process";
import fs from "node:fs";

try {
  const diffServices = execSync("git diff tools/audit/kernel-services.json", { encoding: "utf8" });
  console.log("Services diff:\n", diffServices);

  const diffIds = execSync("git diff tools/audit/kernel-entry-ids.json", { encoding: "utf8" });
  console.log("IDs diff summary:\n", diffIds.split("\n").filter(l => l.startsWith("+") || l.startsWith("-")).slice(0, 30).join("\n"));
} catch (e) {
  console.error(e);
}

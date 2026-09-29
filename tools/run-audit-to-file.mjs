import fs from "node:fs";
import { runCompatGate } from "./audit/compat-gate.js";
import { runNamespaceCheck } from "./audit/namespace.js";
import { runSelfMountCheck } from "./audit/self-mount.js";
import { runDepClosureCheck } from "./audit/dep-closure.js";
import { runSettingsApiCheck } from "./audit/settings-api.js";
import { runSessionApiCheck } from "./audit/session-api.js";
import { runPublishReadinessCheck } from "./audit/publish-readiness.js";
import { runSyntaxCheck } from "./audit/syntax.js";

const report = [];
function log(msg) { report.push(msg); }

const checks = [
  ['compat-gate', runCompatGate],
  ['namespace', runNamespaceCheck],
  ['self-mount', runSelfMountCheck],
  ['dep-closure', runDepClosureCheck],
  ['settings-api', runSettingsApiCheck],
  ['session-api', runSessionApiCheck],
  ['publish-readiness', runPublishReadinessCheck],
  ['syntax', runSyntaxCheck],
];

let totalErr = 0, totalWarn = 0;
for (const [name, fn] of checks) {
  const res = fn();
  log(`=== ${name} === (error=${res.errors.length}, warn=${res.warnings.length})`);
  if (res.errors.length) {
    totalErr += res.errors.length;
    res.errors.forEach(e => log(`  [ERR] ${e}`));
  }
  if (res.warnings.length) {
    totalWarn += res.warnings.length;
    res.warnings.forEach(w => log(`  [WARN] ${w}`));
  }
  if (res.info?.length) {
    res.info.forEach(i => log(`  [INFO] ${i}`));
  }
}

log(`\nTOTAL: errors=${totalErr}, warnings=${totalWarn}`);
fs.writeFileSync("tools/_audit_report.txt", report.join("\n"), "utf8");

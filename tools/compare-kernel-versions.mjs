import fs from "node:fs";

// Let's read git status of tools/audit/
const currentServices = JSON.parse(fs.readFileSync("tools/audit/kernel-services.json", "utf8"));
const currentEntries = JSON.parse(fs.readFileSync("tools/audit/kernel-entry-ids.json", "utf8"));
const currentPackages = JSON.parse(fs.readFileSync("tools/audit/kernel-packages.json", "utf8"));

console.log("Current 0.2.0 Kernel Snapshot Stats:");
console.log("- Kernel Version:", currentPackages.kernelVersion);
console.log("- Total Packages:", currentPackages.count);
console.log("- DeepSeek Packages:", currentPackages.deepseekCount);
console.log("- Total Loader IDs:", currentEntries.count);
console.log("- Total Services:", currentServices.serviceCount);
console.log("- SettingsForms Methods:", currentServices.settingsMethods.length);

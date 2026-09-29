import fs from 'node:fs';
import path from 'node:path';

const ASAR_PATH = 'C:\\Users\\delinger\\AppData\\Local\\Programs\\DeepSeek Harness\\resources\\app.asar';
const fd = fs.openSync(ASAR_PATH, 'r');
const head = Buffer.alloc(16);
fs.readSync(fd, head, 0, 16, 0);

const jsonLen = head.readUInt32LE(12);
const headerBuf = Buffer.alloc(jsonLen);
fs.readSync(fd, headerBuf, 0, jsonLen, 16);
const header = JSON.parse(headerBuf.toString('utf8'));
const baseOffset = 8 + head.readUInt32LE(4);

function getEntry(entryPath) {
  const parts = entryPath.split('/');
  let cur = header;
  for (const p of parts) {
    if (!cur.files || !cur.files[p]) return null;
    cur = cur.files[p];
  }
  return cur;
}

function readFile(entryPath) {
  const entry = getEntry(entryPath);
  if (!entry) return null;
  if (entry.size === 0) return '';
  if (entry.unpacked) {
    const unpackedPath = path.join('C:\\Users\\delinger\\AppData\\Local\\Programs\\DeepSeek Harness\\resources\\app.asar.unpacked', entryPath);
    if (fs.existsSync(unpackedPath)) return fs.readFileSync(unpackedPath, 'utf8');
    return null;
  }
  if (entry.offset === undefined) return null;
  const buf = Buffer.alloc(entry.size);
  fs.readSync(fd, buf, 0, entry.size, baseOffset + Number(entry.offset));
  return buf.toString('utf8');
}

// Check key packages used by dsh-pack:
// What packages do our plugins import or inject?
const REPO = 'C:\\Users\\delinger\\Desktop\\dsh';
const tiers = JSON.parse(fs.readFileSync(path.join(REPO, 'tools', 'tiers.json'), 'utf8'));

console.log('--- Analyzing 0.2.0-rc.1 changes ---');

// 1. Check root app-boot or loader changes
const oldBoot = path.join(REPO, 'node_modules', '@deepseek-ai', 'dsh-app-boot');
console.log('Old app-boot exists:', fs.existsSync(oldBoot));

// 2. Check changes in cordis loader or patch mechanism
const patchYml = readFile('dsh/node_modules/@deepseek-ai/dsh/lib/cordis.desktop.yml');
console.log('0.2.0 cordis.desktop.yml length:', patchYml ? patchYml.length : 'none');

// 3. Check what services were removed or added
const oldServices = JSON.parse(fs.readFileSync(path.join(REPO, 'tools', 'audit', 'kernel-services.json'), 'utf8'));
console.log('Services in 0.2.0:', oldServices.serviceCount);

// 4. Check client package composition or boot graph
const oldModules = path.join(REPO, 'node_modules', '@deepseek-ai', 'dsh-client-modules');
console.log('Old client-modules exists:', fs.existsSync(oldModules));

// 5. Let us inspect cordis.desktop.yml in 0.2.0
if (patchYml) {
  fs.writeFileSync(path.join(REPO, 'tools', '_020_cordis_desktop.yml'), patchYml);
  console.log('Wrote tools/_020_cordis_desktop.yml');
}

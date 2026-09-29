import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(REPO, 'tools', 'audit');

const DEFAULT_ASAR = process.platform === 'win32'
  ? path.join(process.env.LOCALAPPDATA || 'C:\\Users\\delinger\\AppData\\Local', 'Programs', 'DeepSeek Harness', 'resources', 'app.asar')
  : '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar';

const ASAR_PATH = process.argv[2] || DEFAULT_ASAR;

if (!fs.existsSync(ASAR_PATH)) {
  console.error(`未找到 app.asar: ${ASAR_PATH}`);
  process.exit(1);
}

console.log('Reading asar from:', ASAR_PATH);
const fd = fs.openSync(ASAR_PATH, 'r');
const head = Buffer.alloc(16);
fs.readSync(fd, head, 0, 16, 0);

const jsonLen = head.readUInt32LE(12);
const headerBuf = Buffer.alloc(jsonLen);
fs.readSync(fd, headerBuf, 0, jsonLen, 16);
const header = JSON.parse(headerBuf.toString('utf8'));
const baseOffset = 8 + head.readUInt32LE(4);

function getEntry(entryPath) {
  const parts = entryPath.split(/[\\/]/).filter(Boolean);
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
    const unpackedBase = ASAR_PATH + '.unpacked';
    const unpackedPath = path.join(unpackedBase, entryPath);
    if (fs.existsSync(unpackedPath)) return fs.readFileSync(unpackedPath, 'utf8');
    return null;
  }
  if (entry.offset === undefined) return null;
  const buf = Buffer.alloc(entry.size);
  fs.readSync(fd, buf, 0, entry.size, baseOffset + Number(entry.offset));
  return buf.toString('utf8');
}

// 1. Get kernel version
const dshPkgStr = readFile('dsh/node_modules/@deepseek-ai/dsh/package.json');
if (!dshPkgStr) throw new Error('Cannot find @deepseek-ai/dsh/package.json');
const dshPkg = JSON.parse(dshPkgStr);
const kernelVersion = dshPkg.version;
console.log('Detected kernelVersion:', kernelVersion);

// 2. Scan packages in dsh/node_modules
const packages = new Set();
const dshNm = getEntry('dsh/node_modules');
if (!dshNm || !dshNm.files) throw new Error('Cannot find dsh/node_modules in asar');

for (const name of Object.keys(dshNm.files)) {
  const sub = dshNm.files[name];
  if (name.startsWith('@')) {
    if (sub.files) {
      for (const scopedPkg of Object.keys(sub.files)) {
        packages.add(`${name}/${scopedPkg}`);
      }
    }
  } else {
    packages.add(name);
  }
}
const sortedPackages = [...packages].sort();
console.log(`Packages count: ${sortedPackages.length} (DeepSeek count: ${sortedPackages.filter(p => p.startsWith('@deepseek-ai/')).length})`);

// 3. Scan cordis loader ids
const ids = new Map();
function scanCordisForDir(baseDir, entryObj) {
  if (!entryObj || !entryObj.files) return;
  for (const cand of ['cordis.yml', 'cordis.patch.yml']) {
    if (entryObj.files[cand]) {
      const filePath = `${baseDir}/${cand}`;
      const text = readFile(filePath);
      if (text) {
        for (const m of text.matchAll(/^\s*-?\s*id:\s*(['"]?)([^'"\s#][^'"\s#]*)\1\s*$/gm)) {
          if (!ids.has(m[2])) ids.set(m[2], filePath);
        }
      }
    }
  }
}

for (const name of Object.keys(dshNm.files)) {
  const sub = dshNm.files[name];
  if (name.startsWith('@')) {
    if (sub.files) {
      for (const scopedPkg of Object.keys(sub.files)) {
        scanCordisForDir(`dsh/node_modules/${name}/${scopedPkg}`, sub.files[scopedPkg]);
      }
    }
  } else {
    scanCordisForDir(`dsh/node_modules/${name}`, sub);
  }
}

// Check dsh lib *.yml
const dshLib = getEntry('dsh/node_modules/@deepseek-ai/dsh/lib');
if (dshLib && dshLib.files) {
  for (const f of Object.keys(dshLib.files)) {
    if (f.endsWith('.yml')) {
      const text = readFile(`dsh/node_modules/@deepseek-ai/dsh/lib/${f}`);
      if (text) {
        for (const m of text.matchAll(/^\s*-?\s*id:\s*(['"]?)([^'"\s#][^'"\s#]*)\1\s*$/gm)) {
          if (!ids.has(m[2])) ids.set(m[2], `@deepseek-ai/dsh/lib/${f}`);
        }
      }
    }
  }
}

const sortedIds = [...ids.keys()].sort();
console.log(`Loader IDs count: ${sortedIds.length}`);

// 4. Icons snapshot
let iconNames = [];
const primText = readFile('dsh/node_modules/@deepseek-ai/dsh-client-ui-primitives/lib/index.js');
if (primText) {
  const exportBlock = primText.match(/\nexport \{([\s\S]*?)\};/);
  if (exportBlock) {
    const all = new Set();
    for (const m of exportBlock[1].matchAll(/([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?/g)) {
      all.add(m[2] || m[1]);
    }
    iconNames = [...all].filter((n) => /^Icon[A-Za-z0-9]+$/.test(n)).sort();
  }
}
console.log(`Icons count: ${iconNames.length}`);

// 5. Kernel services
const services = new Set();
const settingsMethods = new Set();
const PATTERNS = [
  /super\(\s*(?:this\.)?\w+\s*,\s*["']([a-zA-Z][A-Za-z0-9]*)["']/g,
  /ctx\.provide\(\s*["']([a-zA-Z][A-Za-z0-9]*)["']/g,
  /namespace:\s*["']([a-zA-Z][A-Za-z0-9]*)["']/g,
  /const\s+[A-Z0-9_]*SERVICES?\s*=\s*["']([a-zA-Z][A-Za-z0-9]*)["']/g,
];

const dsDir = getEntry('dsh/node_modules/@deepseek-ai');
if (dsDir && dsDir.files) {
  for (const pkg of Object.keys(dsDir.files)) {
    for (const rel of ['lib/index.js', 'lib/client.js']) {
      const f = `dsh/node_modules/@deepseek-ai/${pkg}/${rel}`;
      const src = readFile(f);
      if (!src) continue;
      for (const re of PATTERNS) {
        for (const m of src.matchAll(re)) services.add(m[1]);
      }
      for (const m of src.matchAll(/\binject\s*[:=]\s*(?:\[|\(\s*\[)([^\])]*?)\]/g)) {
        for (const q of m[1].matchAll(/["']([a-zA-Z][A-Za-z0-9]*)["']/g)) services.add(q[1]);
      }
      if (pkg === 'dsh-settings') {
        const idx = src.indexOf('SettingsForms = class');
        if (idx !== -1) {
          const cls = src.slice(idx);
          for (const m of cls.matchAll(/^\t(?:async )?([a-zA-Z][A-Za-z0-9]*)\(/gm)) settingsMethods.add(m[1]);
        }
      }
    }
  }
}
for (const junk of ['constructor', 'settingsController', 'write']) services.delete(junk);
console.log(`Services count: ${services.size}, SettingsForms methods: ${settingsMethods.size}`);

// Write files
fs.writeFileSync(
  path.join(OUT_DIR, 'dsh-runtime.json'),
  JSON.stringify({
    runtimeVersion: kernelVersion,
    source: '@deepseek-ai/dsh',
    notes: `官方桌面客户端 44.0.0 (桌面端 0.2.0) 内置内核；compat-gate 用它做唯一运行时版本`
  }, null, 2) + '\n'
);

fs.writeFileSync(
  path.join(OUT_DIR, 'kernel-packages.json'),
  JSON.stringify({
    _meta: '由 extract-desktop-snapshots.mjs 生成，勿手改',
    kernelVersion,
    count: sortedPackages.length,
    packages: sortedPackages
  }, null, 2) + '\n'
);

fs.writeFileSync(
  path.join(OUT_DIR, 'kernel-entry-ids.json'),
  JSON.stringify({
    _meta: '由 extract-desktop-snapshots.mjs 生成，勿手改',
    kernelVersion,
    count: sortedIds.length,
    ids: sortedIds
  }, null, 2) + '\n'
);

fs.writeFileSync(
  path.join(OUT_DIR, 'kernel-primitives-icons.json'),
  JSON.stringify({
    _meta: '由 extract-desktop-snapshots.mjs 生成，勿手改',
    kernelVersion,
    count: iconNames.length,
    icons: iconNames
  }, null, 2) + '\n'
);

fs.writeFileSync(
  path.join(OUT_DIR, 'kernel-services.json'),
  JSON.stringify({
    note: '由 tools/audit/extract-desktop-snapshots.mjs 从官方内核抽取；settings-api 门禁据此判「服务/方法是否存在」',
    serviceCount: services.size,
    services: [...services].sort(),
    settingsMethods: [...settingsMethods].sort(),
  }, null, 2) + '\n'
);

console.log('Successfully written all snapshot files to tools/audit/');

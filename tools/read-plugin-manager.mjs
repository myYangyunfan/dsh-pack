import fs from "node:fs";

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
  if (!entry || entry.size === undefined || entry.offset === undefined) return null;
  const buf = Buffer.alloc(entry.size);
  fs.readSync(fd, buf, 0, entry.size, baseOffset + Number(entry.offset));
  return buf.toString('utf8');
}

let out = '';
function log(...args) { out += args.join(' ') + '\n'; }

const pmCode = readFile('dsh/node_modules/@deepseek-ai/dsh-plugin-manager/lib/index.js');
if (pmCode) {
  const lines = pmCode.split('\n');
  const idx = lines.findIndex(l => l.includes('parseInstallSpec') || l.includes('installSpec'));
  log('Lines around installSpec:');
  log(lines.slice(Math.max(0, idx - 10), idx + 60).join('\n'));
}

fs.writeFileSync('tools/_pm_out.txt', out, 'utf8');



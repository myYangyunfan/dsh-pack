// 探针的单测。重点不是「正常输入给正确答案」，而是三件更容易出事的事：
// ① 官方那个「同名但不同形状」的 dshDesktop 必须被判成 official 而不是 legacy（这正是整个 bug 的成因）；
// ② 任何取值路径都不许抛（contextBridge 是不可扩展代理，跨 origin getter 也会抛）；
// ③ 反证：把判据条件一项项拆掉，kind 必须相应改变——否则说明判据其实没在起作用。
import test from 'node:test';
import assert from 'node:assert/strict';
import { probeHost } from '../src/browser.js';
import { probeNodeHost } from '../src/node.js';

const OFFICIAL_BRIDGE = {
  protocolVersion: 1,
  browser: { acquire() {}, release() {}, onOpenRequested() {} },
  updates: { status() {}, open() {}, subscribe() {} },
};

const LEGACY_BRIDGE = {
  protocolVersion: 1,
  getInfo: () => ({ version: '0.6.6', staticPort: 1234 }),
  openPath: () => Promise.resolve(),
  openExternal: () => Promise.resolve(),
  revertFiles: () => Promise.resolve(),
  refreshBalance: () => {},
  restartService: () => Promise.resolve(),
  imagePaste: { save: () => Promise.resolve() },
  pluginManager: { list: () => Promise.resolve([]) },
  wsl: { getConfig: () => Promise.resolve({}) },
  petWindow: { open: () => Promise.resolve() },
};

function win(over = {}) {
  return {
    location: { protocol: 'dsh-app:', hostname: 'app', ...(over.location || {}) },
    dshDesktop: over.dshDesktop,
    __DSH_HOST_PATHS__: over.hostPaths,
    __DSH_DIRECTORY_PICKER__: over.picker,
    __DSH_LOCALE__: over.locale,
  };
}

test('官方宿主：判成 official-desktop，且老壳独占能力全部为 null', () => {
  const caps = probeHost(
    win({
      dshDesktop: OFFICIAL_BRIDGE,
      hostPaths: { pathFor: () => 'C:/tmp/a.txt' },
      picker: { pick: () => Promise.resolve('C:/x') },
      locale: { read: () => 'zh-CN' },
    })
  );
  assert.equal(caps.kind, 'official-desktop');
  assert.equal(caps.isOfficialDesktop, true);
  assert.equal(caps.isLegacyDesktop, false);
  assert.equal(caps.hasTitlebarInset, false, '官方用原生装饰，没有那条 36px 内衬');
  assert.equal(caps.openPath, null);
  assert.equal(caps.revertFiles, null);
  assert.equal(caps.refreshBalance, null);
  assert.equal(caps.wsl, null);
  assert.equal(caps.petWindow, null);
  assert.equal(typeof caps.pathForFile, 'function');
  assert.equal(caps.pathForFile(), 'C:/tmp/a.txt');
  assert.equal(caps.protocolVersion, 1);
  assert.equal(caps.isSupervised, true, '宿主受监督，插件不该自己重启');
});

test('反证：协议或 hostname 不匹配 ⇒ 不能算 official（否则纯浏览器跑 web 会被误判）', () => {
  for (const location of [
    { protocol: 'https:', hostname: 'app' },
    { protocol: 'dsh-app:', hostname: 'example.com' },
    { protocol: 'http:', hostname: '127.0.0.1' },
  ]) {
    const caps = probeHost(win({ dshDesktop: OFFICIAL_BRIDGE, location }));
    assert.equal(caps.isOfficialDesktop, false, `${location.protocol}//${location.hostname} 不该被判成官方`);
    assert.equal(caps.isLegacyDesktop, false);
    assert.equal(caps.kind, 'browser');
  }
});

test('反证：官方桥缺 updates 形状 ⇒ 降级为 browser，不得凭 protocol 就宣布官方', () => {
  const caps = probeHost(win({ dshDesktop: { protocolVersion: 1 } }));
  assert.equal(caps.isOfficialDesktop, false);
  assert.equal(caps.kind, 'browser');
});

test('已退役的老壳：判成 legacy，且带标题栏内衬', () => {
  const caps = probeHost(
    win({ dshDesktop: LEGACY_BRIDGE, location: { protocol: 'http:', hostname: '127.0.0.1' } })
  );
  assert.equal(caps.kind, 'legacy-dsh-desktop');
  assert.equal(caps.hasTitlebarInset, true, '老壳画了 36px 玻璃标题栏');
  assert.equal(typeof caps.revertFiles, 'function');
  assert.equal(typeof caps.refreshBalance, 'function');
});

test('纯浏览器（连 dshDesktop 都没有）：一切原生能力 null，且不抛', () => {
  const caps = probeHost({ location: { protocol: 'https:', hostname: 'harness.example.com' } });
  assert.equal(caps.kind, 'browser');
  assert.equal(caps.isDesktopHost, false);
  assert.equal(caps.isSupervised, false);
  assert.equal(caps.mayRestart, undefined, '没这个字段就别凭空造出来');
  for (const name of ['openPath', 'revertFiles', 'pathForFile', 'pickDirectory', 'updates', 'browser']) {
    assert.equal(caps[name], null, `${name} 应为 null`);
  }
  assert.equal(caps.has('openPath'), false);
});

test('冻结代理与抛错 getter：探针必须吞掉，绝不把异常漏给页面', () => {
  const hostile = {
    get location() {
      throw new Error('跨 origin 访问');
    },
    get dshDesktop() {
      throw new Error('代理拒绝');
    },
    get __DSH_HOST_PATHS__() {
      throw new Error('boom');
    },
  };
  Object.freeze(hostile);
  const caps = probeHost(hostile);
  assert.equal(caps.kind, 'browser');
  assert.equal(caps.has('pathForFile'), false);
  // 连探针参数本身都不给（undefined / null / 非对象）
  for (const input of [undefined, null, 0, '', 'x', []]) {
    const c = probeHost(input);
    assert.equal(typeof c.has, 'function');
    assert.equal(c.isOfficialDesktop, false);
  }
});

test('返回对象是冻结的，插件改不动它', () => {
  const caps = probeHost(win({ dshDesktop: LEGACY_BRIDGE }));
  assert.ok(Object.isFrozen(caps));
  assert.throws(() => {
    'use strict';
    caps.kind = 'hacked';
  }, TypeError);
});

test('has() 只问有无，逼调用方别写 truthiness 判断（36px bug 的成因就是 !window.dshDesktop）', () => {
  const withBridge = probeHost(win({ dshDesktop: LEGACY_BRIDGE }));
  const official = probeHost(win({ dshDesktop: OFFICIAL_BRIDGE }));
  assert.equal(withBridge.has('revertFiles'), true);
  assert.equal(official.has('revertFiles'), false);
  assert.ok(withBridge.dshDesktopWouldBeTruthy === undefined);
  // 关键反证：官方桥下 truthiness 判断会通过，能力判断不会——这就是我们换寻址方式的理由
  assert.ok(OFFICIAL_BRIDGE, '对象本身是 truthy');
  assert.equal(official.has('revertFiles'), false, '但按能力问就是没有');
});

test('node 侧：只认官方宿主独有的 ELECTRON_RUN_AS_NODE + DSH_DESKTOP_NODE_EXECUTABLE 组合', () => {
  const official = probeNodeHost({
    env: { ELECTRON_RUN_AS_NODE: '1', DSH_DESKTOP_NODE_EXECUTABLE: 'C:/x/DeepSeek Harness.exe', DSH_HOME: '/h' },
  });
  assert.equal(official.runtime, 'official-desktop-host');
  assert.equal(official.isSupervised, true);
  assert.equal(official.mayRestartHostProcess, false);
  assert.equal(official.dshHome, '/h');

  // 反证：只有 ELECTRON_RUN_AS_NODE（比如别的 Electron 应用）不算官方宿主
  const partial = probeNodeHost({ env: { ELECTRON_RUN_AS_NODE: '1' } });
  assert.notEqual(partial.runtime, 'official-desktop-host');
  // 反证：值不是 '1' 不算
  assert.notEqual(
    probeNodeHost({ env: { ELECTRON_RUN_AS_NODE: '0', DSH_DESKTOP_NODE_EXECUTABLE: 'x' } }).runtime,
    'official-desktop-host'
  );

  const legacy = probeNodeHost({ env: { DSH_TAURI_USERDATA: 'C:/appdata' } });
  assert.equal(legacy.runtime, 'legacy-dsh-desktop-host');
  assert.equal(legacy.isSupervised, true);

  const plain = probeNodeHost({ env: {} });
  assert.equal(plain.isSupervised, false);
  assert.equal(plain.mayRestartHostProcess, true);

  for (const input of [undefined, null, {}, { env: null }, { get env() { throw new Error('x'); } }]) {
    const r = probeNodeHost(input);
    assert.equal(typeof r.runtime, 'string');
  }
});

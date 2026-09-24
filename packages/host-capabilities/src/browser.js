// 宿主能力探针（浏览器侧）。
//
// 为什么需要它：我们退役的自制壳往页面注入了一个 55 方法的 window.dshDesktop。
// 官方客户端**也**往同一个全局名上挂了对象（preload-app.cjs 的 exposeInMainWorld("dshDesktop", …)），
// 但形状完全不同：{protocolVersion, browser, updates}。于是所有
// 「if (window.dshDesktop) 就走原生分支」的老代码会拿到一个 truthy 却什么都调不通的对象——
// 静默失效，而不是抛错。
//
// 而且这个坑没法用「给老名字打补丁」绕过：contextBridge.exposeInMainWorld 交出来的是
// 不可扩展的代理对象，改不了。所以只能换寻址方式，不能改名续命。
//
// 用法约束（很重要）：本模块必须被各插件的打包器**构建期内联**进 lib/client.js。
// 官方浏览器模块系统只对种子表（PLATFORM_MODULES）、memo 记录、boot-graph 行和已注册工厂
// 解析裸标识符，其余一律 throw——运行时 require 一个 @dsh-pack/* 是会炸的。
// 因此这里保持零 import、零依赖、纯函数。

const EMPTY = {};

function safeGet(owner, key) {
  try {
    return owner == null ? undefined : owner[key];
  } catch {
    // 冻结代理或跨 origin 的 getter 都可能抛；探针的职责是「绝不影响页面」
    return undefined;
  }
}

function asFunction(owner, key) {
  const value = safeGet(owner, key);
  try {
    return typeof value === 'function' ? value.bind(owner) : null;
  } catch {
    return null;
  }
}

function asObject(value) {
  return value && typeof value === 'object' ? value : null;
}

function readLocation(globalObject) {
  const location = safeGet(globalObject, 'location');
  return {
    protocol: safeGet(location, 'protocol'),
    hostname: safeGet(location, 'hostname'),
  };
}

/**
 * 探测当前宿主。**永不抛错**，识别不出的一律降级为不可用。
 * @param globalObject 可注入以便单测；默认取 currentGlobal
 */
export function probeHost(globalObject = EMPTY) {
  const g = globalObject || EMPTY;
  const bridge = safeGet(g, 'dshDesktop');
  const { protocol, hostname } = readLocation(g);

  // official 的判据照抄官方 preload 自己决定「要不要给全量 API」的那条件，
  // 再加一道 updates.subscribe 存在性确认：纯浏览器里跑 web profile 时协议也是 http:，
  // 只有真宿主的渲染进程才会同时满足协议与形状。
  // 注意 updates 是**对象**不是函数，所以要探的是它里面的 subscribe 方法。
  const updates = asObject(safeGet(bridge, 'updates'));
  const official =
    protocol === 'dsh-app:' && hostname === 'app' && asFunction(updates, 'subscribe') !== null;

  // 我们那个已退役的壳总有 getInfo()；官方的三键对象永远没有。用它区分「老壳」而不是「官方」。
  const legacy = !official && asFunction(bridge, 'getInfo') !== null;

  const hostPaths = safeGet(g, '__DSH_HOST_PATHS__');
  const directoryPicker = safeGet(g, '__DSH_DIRECTORY_PICKER__');

  // 老壳独占的能力：官方一个都没有，全部按 null 出参。
  const legacyOnly = {
    openPath: asFunction(bridge, 'openPath'),
    openExternal: asFunction(bridge, 'openExternal'),
    revertFiles: asFunction(bridge, 'revertFiles'),
    refreshBalance: asFunction(bridge, 'refreshBalance'),
    restartService: asFunction(bridge, 'restartService'),
    copyText: asFunction(bridge, 'copyText'),
    sponsorQr: asFunction(bridge, 'sponsorQr'),
    imagePaste: asObject(safeGet(bridge, 'imagePaste')),
    pluginManager: asObject(safeGet(bridge, 'pluginManager')),
    diagBackup: asObject(safeGet(bridge, 'diagBackup')),
    wsl: asObject(safeGet(bridge, 'wsl')),
    petWindow: asObject(safeGet(bridge, 'petWindow')),
    windowControls: asObject(safeGet(bridge, 'windowControls')),
  };

  const caps = {
    kind: legacy ? 'legacy-dsh-desktop' : official ? 'official-desktop' : 'browser',
    isOfficialDesktop: official,
    isLegacyDesktop: legacy,
    isDesktopHost: official || legacy,

    // 官方客户端把宿主进程管得很紧（强制更新准入锁、锁定期 503 connection/request），
    // 老壳同样受监督。插件该问的是「我能不能自己重启/自更新」，答案在两处都是「不能」。
    // 这个字段就是给 dsh-pocket 那类「自己 spawn 宿主」的插件用的常量。
    isSupervised: official || legacy,

    // ↓ 官方客户端提供的原生替身（老壳里为 null，纯浏览器里也为 null）
    pathForFile: asFunction(hostPaths, 'pathFor'),
    pickDirectory: asFunction(directoryPicker, 'pick'),
    browser: asObject(safeGet(bridge, 'browser')),
    updates: asObject(safeGet(bridge, 'updates')),
    locale: asObject(safeGet(g, '__DSH_LOCALE__')),
    protocolVersion: (() => {
      const value = safeGet(bridge, 'protocolVersion');
      return typeof value === 'number' ? value : 0;
    })(),

    // 自制壳画过一条 36px 的玻璃标题栏并给内容留了内衬；官方用原生窗口装饰，没有这条内衬。
    // 老插件里 `window.dshDesktop ? '36px' : '0px'` 的写法在官方客户端下会凭空多出 36px。
    hasTitlebarInset: legacy,

    ...legacyOnly,
  };

  /** 只问「有没有」，不让调用方自己写 truthiness 判断——后者正是上面那个 36px bug 的来源。 */
  caps.has = function has(capability) {
    try {
      return caps[capability] != null;
    } catch {
      return false;
    }
  };

  return Object.freeze(caps);
}

let cached;

/** 模块级 memo：每个插件的 lib/client.js 是各自独立的预构建 bundle，所以这就是「每 bundle 一次」。 */
export function hostCapabilities() {
  if (!cached) cached = probeHost(currentGlobal());
  return cached;
}

function currentGlobal() {
  try {
    return typeof window !== 'undefined' ? window : globalThis;
  } catch {
    return EMPTY;
  }
}

export default hostCapabilities;

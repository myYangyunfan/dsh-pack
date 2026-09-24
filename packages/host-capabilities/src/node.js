// 宿主探针（插件宿主半边用）。
//
// 宿主半边跑在内核自己的 Node 进程里，看不到页面，所以判据只能是进程级的。
// 最有用的信号来自官方桌面宿主传给 runProfile 的 packageManager env：
//   ELECTRON_RUN_AS_NODE=1、DSH_DESKTOP_NODE_EXECUTABLE=<electron 主程序路径>
// 这两个是官方客户端独有的；我们退役的 Tauri 壳用的是 DSH_TAURI_* 一族。
//
// 典型用途：插件据此决定「能不能自己 spawn / 重启宿主」。官方宿主有强制更新准入锁
// （锁定期把 connection/request 打成 503），插件自己重启宿主会打断它，所以在两种壳下
// 答案都是「不能」。

const EMPTY = {};

function readFrom(processObject, name) {
  try {
    const value = processObject?.env?.[name];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

function electronVersionFrom(processObject) {
  try {
    const value = processObject?.versions?.electron;
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * @param processObject 可注入以便单测。**探针一律只读它传进来的东西**，
 *   早先版本在这里偷偷读全局 process，结果单测注入了 env 却什么也读不到。
 */
export function probeNodeHost(processObject = EMPTY) {
  const read = (name) => readFrom(processObject, name);
  const electronVersion = electronVersionFrom(processObject);

  const officialElectron = read('ELECTRON_RUN_AS_NODE') === '1' && read('DSH_DESKTOP_NODE_EXECUTABLE') !== undefined;
  // 内核进程本身不是 Electron（它是 vendor node / 系统 node），所以 process.versions.electron
  // 只在宿主把插件宿主半边跑进 Electron 的 Node 模式时才会出现——老 Tauri 壳就是这种情形。
  const legacyTauri = read('DSH_TAURI_USERDATA') !== undefined || read('DSH_TAURI_APP_DIR') !== undefined;

  let runtime = 'unknown';
  if (officialElectron) runtime = 'official-desktop-host';
  else if (legacyTauri) runtime = 'legacy-dsh-desktop-host';
  else if (read('DSH_WSL_MODE') !== undefined) runtime = 'wsl';
  else if (electronVersion) runtime = 'electron-node';
  else runtime = 'plain-node';

  return Object.freeze({
    runtime,
    isOfficialDesktopHost: runtime === 'official-desktop-host',
    isSupervised: officialElectron || legacyTauri,
    // 受监督的宿主里插件不该自己重启/自更新进程
    mayRestartHostProcess: !officialElectron && !legacyTauri,
    dshHome: read('DSH_HOME'),
    profile: read('DSH_PROFILE') || read('DSH_PROFILE_DIR'),
    electronVersion: electronVersion ?? null,
  });
}

let cached;
export function nodeHost() {
  if (!cached) {
    try {
      cached = probeNodeHost(typeof process === 'undefined' ? EMPTY : process);
    } catch {
      cached = probeNodeHost(EMPTY);
    }
  }
  return cached;
}

export default nodeHost;

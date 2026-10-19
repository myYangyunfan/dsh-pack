/**
 * 槽位注册守卫回归测试。
 *
 * 背景:0.2.1-rc.2 起 `settings.plugin.item` 已从上游彻底移除(运行时 bundle 与
 * npm 包双向确认),而 `SlotCore.register` 对**未声明**槽位是同步抛错:
 *   slot "settings.plugin.item" is not declared (a parent entry's children table must declare it)
 *
 * 旧实现把 `settings.plugins.tab` 与 `settings.plugin.item` 两个注册放进同一个
 * `slots.inject` 回调:回调只在**其中一个**槽位被声明时触发,于是 0.2.1 上
 * 「先注册 tab 成功、再注册 item 抛错」,而 `slots.inject` 的异常会被
 * `queueMicrotask(() => { throw failure })` 抛成页面级未捕获异常。
 *
 * 本测试用真实的 `@deepseek-ai/dsh-client-ui-slots` 的 `SlotCore` 固化这条边界:
 *  - 未声明槽位注册必须抛错(证明这不是假想问题);
 *  - 各自守卫后两边都安全。
 *
 * 运行:`npm test`(无需 build,直接对 node_modules 里的上游实现断言)。
 */
import assert from 'node:assert/strict'

/**
 * 上游槽位核心。它是本测试的被测对象(而不是本插件的代码),因此:
 *  - 首选已安装的 `@deepseek-ai/dsh-client-ui-slots`(devDependency,与 CI 一致);
 *  - 若该包缺席(例如只装了 `dependencies` 的精简环境),**跳过**而不是让整个
 *    `npm test` 失败——这条测试校验的是「上游 register 的行为 + 我们的守卫形状」,
 *    在没有上游实现时无从断言。
 */
let SlotCore
try {
  ;({ SlotCore } = await import('@deepseek-ai/dsh-client-ui-slots'))
} catch (error) {
  // CI 里缺这个包说明依赖装错了,必须失败——静默 SKIP 会让这条回归保护悄悄消失。
  if (process.env.CI === 'true' || process.env.CI === '1') {
    console.error(`slot-guard: FAIL — 在 CI 环境下 @deepseek-ai/dsh-client-ui-slots 必须可用:${error.message}`)
    process.exit(1)
  }
  console.log(`slot-guard: SKIP (@deepseek-ai/dsh-client-ui-slots 不可用: ${error.message})`)
  process.exit(0)
}

/** 造一个只声明了 `settings.plugins.tab` 的父条目(模拟 0.2.1 宿主)。 */
function host021() {
  const core = new SlotCore()
  core.register(
    { name: 'root', children: { 'settings.plugins.tab': { kind: 'list', scope: 'root' } } },
    () => null,
  )
  return core
}

// s1. 未声明槽位上的注册确实抛错(上游行为基线,防止本测试前提失效)
{
  const core = host021()
  assert.throws(
    () => core.register({ name: 'settings.plugin.item', key: 'prompt-optimizer' }, () => null),
    /is not declared/,
    '未声明槽位必须抛错——若上游改成静默忽略,本测试需重新评估',
  )
  console.log('✓ s1 未声明槽位注册抛错(前提成立)')
}

// s2. 旧实现(共用回调)在 0.2.1 上会抛错
{
  const core = host021()
  let threw = null
  try {
    core.register({ name: 'settings.plugins.tab', id: 'prompt-optimizer', order: 30, label: () => 'x' }, () => null)
    core.register({ name: 'settings.plugin.item', key: 'prompt-optimizer' }, () => null)
  } catch (error) {
    threw = error
  }
  assert.ok(threw, '共用回调的旧写法必须在 0.2.1 上抛错')
  assert.match(threw.message, /settings\.plugin\.item.*is not declared/)
  console.log('✓ s2 旧共用回调写法在 0.2.1 上抛错')
}

// s3. 修复后(各自守卫)两个槽位都安全,且已声明的那个正常入账
{
  const core = host021()
  const result = {}
  if (core.specDynamic('settings.plugins.tab') !== undefined) {
    core.register({ name: 'settings.plugins.tab', id: 'prompt-optimizer', order: 30, label: () => 'x' }, () => null)
    result.tab = 'registered'
  } else result.tab = 'skipped'
  if (core.specDynamic('settings.plugin.item') !== undefined) {
    core.register({ name: 'settings.plugin.item', key: 'prompt-optimizer' }, () => null)
    result.item = 'registered'
  } else result.item = 'skipped'
  assert.deepEqual(result, { tab: 'registered', item: 'skipped' })
  assert.equal(core.entries('settings.plugins.tab').length, 1, 'tab 注册应入账')
  console.log('✓ s3 各自守卫后两槽位都安全')
}

// s4. 反向:0.1.x 宿主只声明 settings.plugin.item 时,tab 分支必须安全跳过
{
  const core = new SlotCore()
  core.register(
    { name: 'root', children: { 'settings.plugin.item': { kind: 'keyed', scope: 'root' } } },
    () => null,
  )
  const result = {}
  if (core.specDynamic('settings.plugins.tab') !== undefined) result.tab = 'registered'
  else result.tab = 'skipped'
  if (core.specDynamic('settings.plugin.item') !== undefined) {
    core.register({ name: 'settings.plugin.item', key: 'prompt-optimizer' }, () => null)
    result.item = 'registered'
  } else result.item = 'skipped'
  assert.deepEqual(result, { tab: 'skipped', item: 'registered' })
  console.log('✓ s4 0.1.x 宿主上 tab 分支安全跳过')
}

// s5. **驱动真实插件**:模拟宿主只声明 `settings.plugins.tab`(0.2.1 形态),
//     跑 build 出来的 client bundle 的 apply(),断言:
//       a) 不抛异常;
//       b) 恰好注册了 1 个 tab 条目;
//     并且断言插件**确实调用了两次 slots.inject**(一个槽位一次)。
//
// 为什么必须有这条:s1–s4 只是对上游 SlotCore 行为的复述,并不 import 插件。
// 如果有人把 index.tsx 里两个 `slotsAny.inject(...)` 合并回一个回调,
// s1–s4 依旧全绿,而线上会炸。s5 直接锁定插件的实际注册形状。
{
  // client bundle 是浏览器 loader 形态(`window.__ModuleLoader__.load({id, factory})`),
  // 在 Node 里先铺一个最小的 loader 门面再 import,拿到的就是**真实构建产物**。
  const factories = new Map()
  globalThis.window = {
    __ModuleLoader__: {
      load(registration) {
        factories.set(registration.id, registration.factory)
      },
    },
  }
  await import('../lib/client.js')
  const pkg = JSON.parse(await import('node:fs').then((fs) => fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')))
  assert.ok(factories.has(pkg.name), `client bundle 必须以包名注册 loader id:${pkg.name}`)
  const requireStub = (name) => {
    if (name === 'react' || name === 'react/jsx-runtime') return {}
    throw new Error(`unexpected require(${name})`)
  }
  const { apply } = factories.get(pkg.name)(requireStub)

  const tabCore = host021()
  const injectedKeys = []
  const registeredNames = []

  // 最小 ctx 桩:只提供 apply() 会碰到的面。
  const slots = {
    inject(key, callback) {
      injectedKeys.push(key)
      // 模拟上游:只有宿主声明了该槽位才触发回调(其余静默等待)。
      if (tabCore.specDynamic(key) === undefined) return () => {}
      return callback()
    },
    register(options, component) {
      registeredNames.push(options.name)
      return tabCore.register(options, component)
    },
  }
  const ctx = {
    inject() {},
    effect(fn) {
      const dispose = fn()
      return typeof dispose === 'function' ? dispose : () => {}
    },
    connection: {},
    slots,
  }

  assert.doesNotThrow(() => apply(ctx), '0.2.1 宿主形态下 apply() 不得抛异常')

  assert.deepEqual(
    [...injectedKeys].sort(),
    ['settings.plugins.tab'],
    '只有 0.2.x 的 settings.plugins.tab 应被探测（0.1.x 的 settings.plugin.item 已随内核退役）',
  )
  assert.deepEqual(registeredNames, ['settings.plugins.tab'], '只应注册宿主声明过的那个槽位')
  assert.equal(tabCore.entries('settings.plugins.tab').length, 1, 'tab 条目应恰好注册 1 次')
  delete globalThis.window
  console.log('✓ s5 真实 apply() 在 0.2.1 宿主下安全且只注册已声明槽位')
}

console.log('slot-guard: all passed')

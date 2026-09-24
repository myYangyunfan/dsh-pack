/**
 * dsh-offpeak — peak/off-peak 判定回归单测（issue #158）。
 *
 * 覆盖：
 *   1. 用户 CC0 向量（https://github.com/xyzs996/deepseek-peak-offpeak-vectors，
 *      deepseek-live-2026-08-23 与 synthetic-overnight-peak 两套日程）；
 *   2. 周末全天非高峰 / 工作日窗口内高峰 / 工作日窗口外非高峰；
 *   3. 时区边界（UTC 周日跨到北京周一凌晨）；
 *   4. peakStartOf / allowedHoursFor 的星期口径同步。
 *
 * 运行：`node --test test/index.test.js`（本插件目录下）。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { apply, isPeak, peakStartOf, beijingNow, allowedHoursFor } from "../src/index.js";

/** 北京高峰窗口（分钟数，含起点不含终点）：周一至周五 09:00–12:00、14:00–18:00。 */
const LIVE_WINDOWS = [
  { start: 9 * 60, end: 12 * 60 },
  { start: 14 * 60, end: 18 * 60 },
];

/** 合成「跨 UTC/北京日历分岔」窗口：UTC 16:00–22:00 = 北京次日 00:00–06:00。 */
const SYNTH_WINDOWS = [{ start: 0, end: 6 * 60 }];

/** 用插件自己的 beijingNow() 做 UTC→北京换算，再喂 isPeak，保证测试与被测共用同一套时区口径。 */
function judge(atUtc, windows) {
  const bj = beijingNow(Date.parse(atUtc));
  return isPeak(bj.minutes, windows, bj.weekday, bj.date);
}

/** 用极简 cordis 假 ctx 挂载插件，捕获注册路由并立即清掉调度器定时器。 */
function mountOffpeak() {
  const registered = [];
  const cleanupFns = [];
  const ctx = {
    on: () => () => {},
    effect: (fn) => { cleanupFns.push(fn()); },
    logger: { warn: () => {}, error: () => {} },
    // 属性访问形态（模块级 inject 导出声明）：插件 IIFE 直接用主 ctx。
    webServer: { register: (entry) => registered.push(entry) },
    apiProxy: undefined,
    agentDefaultModel: undefined,
  };
  apply(ctx, {
    debug: true,
    effectiveFrom: "2026-08-17",
    statePath: join(tmpdir(), `dsh-offpeak-test-${process.pid}-${Date.now()}.json`),
  });
  for (const cleanup of cleanupFns) {
    try { cleanup(); } catch { /* noop */ }
  }
  return { registered };
}

/** 最小 res 捕获器，用于直接调用 HTTP 处理器。 */
function captureResponse() {
  const res = { status: 0, headers: {}, body: "" };
  res.writeHead = (status, headers) => { res.status = status; res.headers = headers ?? {}; };
  res.end = (body) => { res.body = body === undefined ? "" : String(body); };
  return res;
}

// ---- CC0 向量：deepseek-live-2026-08-23（真实 DeepSeek 日程） ----
const liveVectors = [
  { atUtc: "2026-08-24T01:30:00Z", expect: "peak", beijing: "Mon 09:30" },
  { atUtc: "2026-08-24T04:00:00Z", expect: "offpeak", beijing: "Mon 12:00" },
  { atUtc: "2026-08-24T05:59:59Z", expect: "offpeak", beijing: "Mon 13:59:59" },
  { atUtc: "2026-08-24T06:00:00Z", expect: "peak", beijing: "Mon 14:00" },
  { atUtc: "2026-08-24T09:59:59Z", expect: "peak", beijing: "Mon 17:59:59" },
  { atUtc: "2026-08-24T10:00:00Z", expect: "offpeak", beijing: "Mon 18:00" },
  { atUtc: "2026-08-23T01:30:00Z", expect: "offpeak", beijing: "Sun 09:30" },
  { atUtc: "2026-08-23T07:00:00Z", expect: "offpeak", beijing: "Sun 15:00" },
  { atUtc: "2026-08-29T02:00:00Z", expect: "offpeak", beijing: "Sat 10:00" },
  { atUtc: "2026-08-22T01:30:00Z", expect: "peak", beijing: "Sat 09:30" },
  { atUtc: "2026-08-22T09:59:59Z", expect: "peak", beijing: "Sat 17:59:59" },
  { atUtc: "2026-08-22T16:00:00Z", expect: "offpeak", beijing: "Sun 00:00" },
];

// ---- CC0 向量：synthetic-overnight-peak（窗口覆盖 UTC 16:00 之后，暴露「读错日历」） ----
const synthVectors = [
  { atUtc: "2026-08-28T16:30:00Z", expect: "offpeak", beijing: "Sat 00:30" },
  { atUtc: "2026-08-30T16:30:00Z", expect: "peak", beijing: "Mon 00:30" },
  { atUtc: "2026-08-29T17:00:00Z", expect: "offpeak", beijing: "Sun 01:00" },
];

test("CC0 live 向量：工作日窗口 + 周末覆盖 + 生效边界", () => {
  for (const v of liveVectors) {
    assert.equal(
      judge(v.atUtc, LIVE_WINDOWS),
      v.expect === "peak",
      `${v.atUtc} (${v.beijing}) 应判定为 ${v.expect}`,
    );
  }
});

test("CC0 synthetic 向量：星期读北京日历而非未平移的 UTC 瞬间", () => {
  for (const v of synthVectors) {
    assert.equal(
      judge(v.atUtc, SYNTH_WINDOWS),
      v.expect === "peak",
      `${v.atUtc} (${v.beijing}) 应判定为 ${v.expect}`,
    );
  }
});

test("周末全天非高峰 / 工作日窗口内高峰 / 工作日窗口外非高峰", () => {
  assert.equal(judge("2026-08-29T02:00:00Z", LIVE_WINDOWS), false, "周六 10:00 整天空闲");
  assert.equal(judge("2026-08-23T07:00:00Z", LIVE_WINDOWS), false, "周日 15:00 整天空闲");
  assert.equal(judge("2026-08-24T01:30:00Z", LIVE_WINDOWS), true, "周一 09:30 窗口内高峰");
  assert.equal(judge("2026-08-24T05:30:00Z", LIVE_WINDOWS), false, "周一 13:30 窗口外非高峰");
});

test("时区边界：周日跨到周一凌晨（按北京日历判定）", () => {
  // 2026-08-30T16:30Z：UTC 仍是周日，北京已是 2026-08-31 周一 00:30。
  assert.equal(judge("2026-08-30T16:30:00Z", SYNTH_WINDOWS), true, "北京周一 00:30 落入合成窗口 → 高峰");
  assert.equal(judge("2026-08-30T16:30:00Z", LIVE_WINDOWS), false, "北京周一 00:30 不在真实窗口 → 非高峰");
});

test("beijingNow 的星期与机器本地时区无关", () => {
  const sun = beijingNow(Date.parse("2026-08-22T16:00:00Z")); // 北京 2026-08-23 00:00 周日
  assert.equal(sun.date, "2026-08-23");
  assert.equal(sun.weekday, 7, "周日=7");
  assert.equal(sun.isWeekend, true);

  const mon = beijingNow(Date.parse("2026-08-30T16:30:00Z")); // 北京 2026-08-31 00:30 周一
  assert.equal(mon.weekday, 1, "周一=1");
  assert.equal(mon.isWeekend, false);
});

test("peakStartOf 工作日返回窗口起点、周末返回 null", () => {
  assert.equal(peakStartOf(570, LIVE_WINDOWS, 1, "2026-08-24"), 9 * 60, "周一 09:30 → 09:00");
  assert.equal(peakStartOf(600, LIVE_WINDOWS, 6, "2026-08-29"), null, "周六（规则生效后）→ null");
  assert.equal(peakStartOf(600, LIVE_WINDOWS, 6, "2026-08-22"), 9 * 60, "周六（规则生效前，不溯及）→ 09:00");
});

test("allowedHoursFor 周末全天可排、工作日仅低价时段", () => {
  assert.equal(allowedHoursFor(1).length, 15, "周一 15 小时");
  assert.equal(allowedHoursFor(5).length, 15, "周五 15 小时");
  assert.equal(allowedHoursFor(6).length, 24, "周六 24 小时");
  assert.equal(allowedHoursFor(7).length, 24, "周日 24 小时");
  assert.ok(!allowedHoursFor(1).includes(9), "工作日不含 9 点");
  assert.ok(allowedHoursFor(6).includes(9), "周末含 9 点");
});

test("注册面不变：路由仍在，state 序列化含 inPeak/hourOptions 且不抛异常", () => {
  const { registered } = mountOffpeak();
  const paths = registered.map((e) => e.path);
  const expected = [
    "/ds-offpeak/state",
    "/ds-offpeak/ack",
    "/ds-offpeak/dismiss",
    "/ds-offpeak/schedule",
    "/ds-offpeak/cancel",
    "/ds-offpeak/execute",
    "/ds-offpeak/debug-remind",
  ];
  for (const p of expected) {
    assert.ok(paths.includes(p), `${p} 仍应注册`);
  }

  const stateEntry = registered.find((e) => e.path === "/ds-offpeak/state");
  assert.ok(stateEntry !== undefined, "state 路由存在");
  const res = captureResponse();
  stateEntry.handler({ method: "GET", headers: {} }, res);
  assert.equal(res.status, 200);
  const body = JSON.parse(res.body);
  assert.equal(typeof body.inPeak, "boolean", "inPeak 为布尔");
  assert.ok(Array.isArray(body.peakWindows), "peakWindows 为数组");
  assert.ok(Array.isArray(body.hourOptions), "hourOptions 为数组（buildHourOptions 正常运行）");
});

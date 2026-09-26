import assert from "node:assert/strict";
import test from "node:test";
import {
  activeMsFromStats,
  buildReadingSummary,
  formatActiveDuration,
  getNovaShelfLine,
  isLateNight,
  progressPercent,
} from "./nova-moments.ts";

const DAY = 24 * 60 * 60_000;

test("isLateNight covers 23:00 to 04:59", () => {
  assert.equal(isLateNight(new Date(2026, 8, 27, 23, 0)), true);
  assert.equal(isLateNight(new Date(2026, 8, 27, 4, 59)), true);
  assert.equal(isLateNight(new Date(2026, 8, 27, 5, 0)), false);
  assert.equal(isLateNight(new Date(2026, 8, 27, 22, 59)), false);
});

test("formatActiveDuration uses minutes and hours", () => {
  assert.equal(formatActiveDuration(30_000), "不到 1 分钟");
  assert.equal(formatActiveDuration(42 * 60_000), "42 分钟");
  assert.equal(formatActiveDuration(60 * 60_000), "1 小时");
  assert.equal(formatActiveDuration(95 * 60_000), "1 小时 35 分钟");
});

test("activeMsFromStats adds the running segment only while active", () => {
  const stats = { totalActiveTime: 60_000, lastActivityTime: 1_000, isActive: true };
  assert.equal(activeMsFromStats(stats, 31_000), 90_000);
  assert.equal(activeMsFromStats({ ...stats, isActive: false }, 31_000), 60_000);
  assert.equal(activeMsFromStats(null, 31_000), 0);
});

test("progressPercent clamps and handles missing totals", () => {
  assert.equal(progressPercent({ current: 9, total: 100 }), 10);
  assert.equal(progressPercent({ current: 150, total: 100 }), 100);
  assert.equal(progressPercent({ current: 0, total: 0 }), null);
  assert.equal(progressPercent(undefined), null);
});

test("buildReadingSummary skips very short sessions", () => {
  assert.equal(
    buildReadingSummary({ activeMs: 50_000, startPercent: 1, endPercent: 2, annotations: 0, lateNight: false }),
    null,
  );
});

test("buildReadingSummary lists progress, annotations and a late-night nudge", () => {
  assert.deepEqual(
    buildReadingSummary({ activeMs: 42 * 60_000, startPercent: 12, endPercent: 19, annotations: 3, lateNight: true }),
    { title: "和 Nova 一起读了 42 分钟", description: "从 12% 读到 19% · Nova 留了 3 条边注 · 夜深了，早点休息～" },
  );
  assert.deepEqual(
    buildReadingSummary({ activeMs: 5 * 60_000, startPercent: 20, endPercent: 20, annotations: 0, lateNight: false }),
    { title: "和 Nova 一起读了 5 分钟", description: "下次见～" },
  );
});

test("getNovaShelfLine only speaks for notable books", () => {
  const now = 100 * DAY;
  assert.equal(getNovaShelfLine({ status: "reading", lastReadAt: now - 5 * DAY }, now), "5 天没翻了，它有点寂寞");
  assert.equal(getNovaShelfLine({ status: "reading", lastReadAt: now - 40 * DAY }, now), "好久不见…还记得读到哪了吗？");
  assert.equal(
    getNovaShelfLine({ status: "reading", lastReadAt: now - DAY / 2, progressCurrent: 95, progressTotal: 100 }, now),
    "只差一点点就读完啦！",
  );
  assert.equal(
    getNovaShelfLine({ status: "reading", lastReadAt: now - DAY / 2, progressCurrent: 30, progressTotal: 100 }, now),
    null,
  );
  assert.equal(
    getNovaShelfLine({ status: "completed", completedAt: now - 2 * DAY }, now),
    "读完啦！要不要写几句感想？",
  );
  assert.equal(getNovaShelfLine({ status: "completed", completedAt: now - 20 * DAY }, now), null);
  assert.equal(getNovaShelfLine({ status: "unread", addedAt: now - DAY }, now), "新书！什么时候一起读？");
  assert.equal(getNovaShelfLine({ addedAt: now - 10 * DAY }, now), null);
});

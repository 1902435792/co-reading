import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_CO_READING_TRIGGER,
  QUEUE_DISPATCH_CHARS,
  QUEUE_MAX_WAIT_MS,
  groupByFocusKey,
  isJevPickNote,
  normalizeCoReadingTrigger,
  pauseMsFor,
  readableLength,
  requiredDwellMs,
  shouldDispatchQueue,
  takeQueueBatch,
} from "./co-reading-trigger.ts";

test("normalizeCoReadingTrigger fills defaults and clamps seconds", () => {
  assert.deepEqual(normalizeCoReadingTrigger(null), DEFAULT_CO_READING_TRIGGER);
  assert.equal(DEFAULT_CO_READING_TRIGGER.seconds, 2);
  assert.equal(DEFAULT_CO_READING_TRIGGER.fast, true);
  assert.equal(normalizeCoReadingTrigger({ seconds: 0 }).seconds, 1);
  assert.equal(normalizeCoReadingTrigger({ seconds: 99 }).seconds, 10);
  assert.equal(normalizeCoReadingTrigger({ seconds: "3" }).seconds, 2);
  assert.deepEqual(normalizeCoReadingTrigger({ smart: false, wavy: false, fast: false, seconds: 4 }), {
    smart: false,
    wavy: false,
    fast: false,
    seconds: 4,
  });
});

test("requiredDwellMs: fixed seconds when smart is off, length-based when on", () => {
  assert.equal(requiredDwellMs("短", false, 2), 2_000);
  assert.equal(requiredDwellMs("x".repeat(500), false, 3), 3_000);
  // 智能：短段落至少 1.5 秒，长段落最多 8 秒，中间按每秒 20 字估算。
  assert.equal(requiredDwellMs("短句。", true, 2), 1_500);
  assert.equal(requiredDwellMs("字".repeat(100), true, 2), 5_000);
  assert.equal(requiredDwellMs("字".repeat(1_000), true, 2), 8_000);
});

test("readableLength counts English words as two characters", () => {
  assert.equal(readableLength("你好 世界"), 4);
  assert.equal(readableLength("hello world"), 4);
  assert.equal(readableLength("读 book"), 3);
});

test("pauseMsFor clamps between 1 and 5 seconds", () => {
  assert.equal(pauseMsFor(2), 2_000);
  assert.equal(pauseMsFor(0), 1_000);
  assert.equal(pauseMsFor(10), 5_000);
});

test("shouldDispatchQueue: pause, size, count or age", () => {
  const base = {
    queuedCount: 2,
    queuedChars: 300,
    maxBlocks: 12,
    idleMs: 0,
    pauseMs: 2_000,
    oldestWaitMs: 1_000,
  };
  assert.equal(shouldDispatchQueue(base), false);
  assert.equal(shouldDispatchQueue({ ...base, queuedCount: 0, idleMs: 99_999 }), false);
  assert.equal(shouldDispatchQueue({ ...base, idleMs: 2_000 }), true);
  assert.equal(shouldDispatchQueue({ ...base, queuedChars: QUEUE_DISPATCH_CHARS }), true);
  assert.equal(shouldDispatchQueue({ ...base, queuedCount: 12 }), true);
  assert.equal(shouldDispatchQueue({ ...base, oldestWaitMs: QUEUE_MAX_WAIT_MS }), true);
});

test("takeQueueBatch respects block and char limits but always takes one", () => {
  const blocks = ["aaaa", "bbbb", "cccc"].map((text) => ({ text }));
  assert.deepEqual(takeQueueBatch(blocks, 2, 100).map((b) => b.text), ["aaaa", "bbbb"]);
  assert.deepEqual(takeQueueBatch(blocks, 12, 9).map((b) => b.text), ["aaaa", "bbbb"]);
  assert.deepEqual(takeQueueBatch([{ text: "x".repeat(50) }], 12, 10).length, 1);
  assert.deepEqual(takeQueueBatch([], 12, 10), []);
});

test("groupByFocusKey keeps order within and across groups", () => {
  const groups = groupByFocusKey([
    { id: 1, focusKey: "a" },
    { id: 2, focusKey: "b" },
    { id: 3, focusKey: "a" },
  ]);
  assert.deepEqual(
    groups.map((group) => group.map((item) => item.id)),
    [
      [1, 3],
      [2],
    ]
  );
});

test("isJevPickNote only matches ai squiggly notes", () => {
  assert.equal(isJevPickNote({ author: "ai", style: "squiggly" }), true);
  assert.equal(isJevPickNote({ author: "ai", style: "underline" }), false);
  assert.equal(isJevPickNote({ author: "human", style: "squiggly" }), false);
});

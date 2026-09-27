import assert from "node:assert/strict";
import test from "node:test";
import { inkDotGeometry, inkStrength, rememberNoteWorth } from "./nova-ink.ts";

const rect = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});

test("inkDotGeometry sits after the last line", () => {
  const geometry = inkDotGeometry([rect(10, 10, 200, 20), rect(10, 40, 80, 20)], false);
  assert.deepEqual(geometry, { cx: 90 + 3.6 + 2, cy: 50, r: 3.6 });
});

test("inkDotGeometry goes below the last column in vertical text", () => {
  const geometry = inkDotGeometry([rect(100, 0, 20, 300)], true);
  assert.deepEqual(geometry, { cx: 110, cy: 300 + 3.6 + 2, r: 3.6 });
});

test("inkDotGeometry ignores empty rects", () => {
  assert.equal(inkDotGeometry([rect(0, 0, 0, 0)], false), null);
  assert.equal(inkDotGeometry([], false), null);
});

test("inkStrength grows with comment length", () => {
  assert.equal(inkStrength(""), 0.45);
  assert.equal(inkStrength("字".repeat(125)), 0.7);
  assert.equal(inkStrength("字".repeat(400)), 0.95);
});

test("inkStrength prefers Jev worth over length", () => {
  assert.equal(inkStrength("字".repeat(400), 0), 0.4);
  assert.equal(inkStrength("", 1), 0.95);
  assert.equal(inkStrength("短", 0.5), 0.68);
  assert.equal(inkStrength("字".repeat(125), null), 0.7);
  assert.equal(inkStrength("字".repeat(125), Number.NaN), 0.7);
});

test("rememberNoteWorth caps entries and keeps the newest", () => {
  let map: Record<string, number> = {};
  for (let i = 0; i < 5; i++) map = rememberNoteWorth(map, `n${i}`, i / 4, 3);
  assert.equal(Object.keys(map).join(","), "n2,n3,n4");
  map = rememberNoteWorth(map, "n2", 2, 3);
  assert.equal(Object.keys(map).join(","), "n3,n4,n2");
  assert.equal(map.n2, 1);
});

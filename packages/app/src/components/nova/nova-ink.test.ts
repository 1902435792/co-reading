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

test("inkDotGeometry skips whitespace-only trailing rects", () => {
  const geometry = inkDotGeometry([rect(10, 10, 200, 20), rect(210, 10, 1, 20)], false);
  assert.equal(geometry?.cx, 210 + (geometry?.r ?? 0) + 2);
});

test("inkDotGeometry stays inside the overlay bounds", () => {
  const bounds = { width: 300, height: 400 };
  const edge = inkDotGeometry([rect(10, 380, 290, 16)], false, bounds);
  assert.ok(edge);
  assert.ok(edge.cx + edge.r * 1.9 <= bounds.width);
  assert.ok(edge.cy + edge.r * 1.9 <= bounds.height);
  const inside = inkDotGeometry([rect(10, 10, 100, 20)], false, bounds);
  assert.equal(inside?.cx, 110 + (inside?.r ?? 0) + 2);
  const column = inkDotGeometry([rect(100, 0, 20, 398)], true, bounds);
  assert.ok(column);
  assert.ok(column.cy + column.r * 1.9 <= bounds.height);
});

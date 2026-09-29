import assert from "node:assert/strict";
import test from "node:test";
import { endsWithPunctuation, inkDotGeometry, inkStrength, rememberNoteWorth } from "./nova-ink.ts";

const rect = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});

test("inkDotGeometry sits inside the last character cell, never past its right edge", () => {
  const geometry = inkDotGeometry([rect(10, 10, 200, 20), rect(10, 40, 80, 20)], false);
  assert.ok(geometry);
  assert.equal(geometry.r, 2.6);
  assert.ok(geometry.cx + geometry.r <= 90, "dot must not reach into the next character");
  assert.ok(geometry.cy - geometry.r >= 40 && geometry.cy < 50, "dot sits in the upper half of the last line");
});

test("inkDotGeometry lifts the dot into the line gap when the sentence ends with a character", () => {
  const geometry = inkDotGeometry([rect(10, 40, 80, 20)], false, undefined, false);
  assert.ok(geometry);
  assert.ok(geometry.cx + geometry.r <= 90);
  assert.ok(geometry.cy < 40);
});

test("inkDotGeometry sits in the bottom-left of the last cell in vertical text", () => {
  const geometry = inkDotGeometry([rect(100, 0, 20, 300)], true);
  assert.ok(geometry);
  assert.ok(geometry.cx - geometry.r >= 100 && geometry.cx < 110);
  assert.ok(geometry.cy + geometry.r <= 300);
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
  assert.ok(geometry);
  assert.ok(geometry.cx <= 210 && geometry.cx > 200);
});

test("inkDotGeometry stays inside the overlay bounds", () => {
  const bounds = { width: 300, height: 400 };
  const edge = inkDotGeometry([rect(10, 0, 290, 16)], false, bounds, false);
  assert.ok(edge);
  assert.ok(edge.cy - edge.r * 1.8 >= 0);
  assert.ok(edge.cx + edge.r * 1.8 <= bounds.width);
  const column = inkDotGeometry([rect(100, 0, 20, 398)], true, bounds);
  assert.ok(column);
  assert.ok(column.cy + column.r * 1.8 <= bounds.height);
});

test("endsWithPunctuation", () => {
  assert.equal(endsWithPunctuation("他们沦落江湖是有不同原因的。"), true);
  assert.equal(endsWithPunctuation("“反权力”"), true);
  assert.equal(endsWithPunctuation("知识分子"), false);
  assert.equal(endsWithPunctuation(""), false);
});

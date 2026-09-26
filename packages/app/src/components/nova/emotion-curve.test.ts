import assert from "node:assert/strict";
import test from "node:test";
import {
  type EmotionPoint,
  addEmotionPoint,
  buildEmotionChart,
  emotionExtremes,
  smoothEmotion,
  valenceFromProbabilities,
} from "./emotion-curve.ts";

const p = (fraction: number, valence: number, intensity = 0.5, at = fraction * 1000): EmotionPoint => ({
  at,
  fraction,
  valence,
  intensity,
  sectionLabel: `s${fraction}`,
});

test("valenceFromProbabilities", () => {
  assert.equal(valenceFromProbabilities({ positive: 0.7, neutral: 0.2, negative: 0.1 }), 0.6);
  assert.equal(valenceFromProbabilities({}), 0);
});

test("addEmotionPoint dedupes nearby places, sorts and caps by age", () => {
  let points: EmotionPoint[] = [];
  points = addEmotionPoint(points, p(0.5, 0.2));
  points = addEmotionPoint(points, p(0.1, -0.2));
  points = addEmotionPoint(points, { ...p(0.5005, 0.9), at: 9999 });
  assert.equal(points.length, 2);
  assert.equal(points[0]?.fraction, 0.1);
  assert.equal(points[1]?.valence, 0.9);
  const capped = addEmotionPoint(points, p(0.9, 0, 0.5, 5000), 2);
  assert.equal(capped.length, 2);
  assert.equal(capped.map((item) => item.fraction).join(","), "0.5005,0.9");
});

test("smoothEmotion keeps sign and dampens spikes", () => {
  const smooth = smoothEmotion([p(0.1, -1), p(0.2, 1), p(0.3, -1)], 1);
  assert.equal(smooth.length, 3);
  assert.ok(Math.abs(smooth[1] ?? 0) < 1);
  assert.equal(smoothEmotion([]).length, 0);
});

test("buildEmotionChart maps to svg coordinates", () => {
  const chart = buildEmotionChart([p(0, 0), p(1, 0)], 200, 100, 10);
  assert.equal(chart.zeroY, 50);
  assert.equal(chart.line, "M10,50 L190,50");
  assert.ok(chart.area.startsWith("M10,50 L10,50"));
  assert.ok(chart.area.endsWith("Z"));
  assert.equal(chart.dots[0]?.r, 3.5);
  assert.equal(buildEmotionChart([], 200, 100).line, "");
});

test("emotionExtremes finds bright and dark stretches", () => {
  const points = [p(0.1, 0.9, 1), p(0.15, 0.8, 1), p(0.5, 0, 0.2), p(0.85, -0.8, 1), p(0.9, -0.9, 1)];
  const { brightest, darkest } = emotionExtremes(points);
  assert.ok((brightest?.fraction ?? 1) < 0.2);
  assert.ok((darkest?.fraction ?? 0) > 0.8);
  assert.equal(emotionExtremes([p(0.5, 0)]).brightest, undefined);
});

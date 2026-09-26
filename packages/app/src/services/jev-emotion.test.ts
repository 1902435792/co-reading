import assert from "node:assert/strict";
import test from "node:test";
import { emotionFromAnswers } from "./jev-rules.ts";

test("emotionFromAnswers uses probabilities when present", () => {
  const result = emotionFromAnswers({
    tone: { choice: "negative", probabilities: { positive: 0.1, neutral: 0.2, negative: 0.7 } },
    intense: { noul: 0.8 },
  });
  assert.equal(result?.valence, -0.6);
  assert.equal(result?.intensity, 0.8);
});

test("emotionFromAnswers falls back to choice confidence and default intensity", () => {
  const result = emotionFromAnswers({ tone: { choice: "positive", confidence: 0.9 } });
  assert.equal(result?.valence, 0.9);
  assert.equal(result?.intensity, 0.5);
  assert.equal(emotionFromAnswers({ tone: { choice: "neutral", confidence: 0.9 } })?.valence, 0);
  assert.equal(emotionFromAnswers({}), null);
});

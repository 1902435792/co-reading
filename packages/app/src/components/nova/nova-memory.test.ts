import assert from "node:assert/strict";
import test from "node:test";
import {
  DIARY_MIN_ACTIVE_MS,
  DIARY_PROPOSE_COOLDOWN_MS,
  coReadingProfileAdvice,
  diaryProposalText,
  isVcpBridgeUrl,
  shouldProposeDiary,
} from "./nova-memory.ts";

const now = 1_000_000_000_000;

test("close needs enough reading time and new records", () => {
  assert.equal(shouldProposeDiary({ trigger: "close", unwrittenCount: 5, activeMs: DIARY_MIN_ACTIVE_MS, now }), true);
  assert.equal(
    shouldProposeDiary({ trigger: "close", unwrittenCount: 5, activeMs: DIARY_MIN_ACTIVE_MS - 1, now }),
    false,
  );
  assert.equal(shouldProposeDiary({ trigger: "close", unwrittenCount: 2, activeMs: DIARY_MIN_ACTIVE_MS, now }), false);
});

test("cooldown applies except when the book is finished", () => {
  const lastProposedAt = now - DIARY_PROPOSE_COOLDOWN_MS + 1;
  assert.equal(shouldProposeDiary({ trigger: "chapter-card", unwrittenCount: 9, lastProposedAt, now }), false);
  assert.equal(
    shouldProposeDiary({
      trigger: "chapter-card",
      unwrittenCount: 9,
      lastProposedAt: now - DIARY_PROPOSE_COOLDOWN_MS,
      now,
    }),
    true,
  );
  assert.equal(shouldProposeDiary({ trigger: "finished", unwrittenCount: 1, lastProposedAt, now }), true);
  assert.equal(shouldProposeDiary({ trigger: "finished", unwrittenCount: 0, now }), false);
});

test("diaryProposalText mentions the count", () => {
  for (const trigger of ["close", "finished", "chapter-card"] as const) {
    assert.match(diaryProposalText(trigger, 7).description, /7 条/);
  }
});

test("isVcpBridgeUrl", () => {
  assert.equal(isVcpBridgeUrl("http://127.0.0.1:3100/v1"), true);
  assert.equal(isVcpBridgeUrl("http://localhost:3100"), true);
  assert.equal(isVcpBridgeUrl("https://api.openai.com/v1"), false);
  assert.equal(isVcpBridgeUrl(undefined), false);
});

test("coReadingProfileAdvice", () => {
  assert.equal(coReadingProfileAdvice("coreading-lite/gemini")?.level, "ok");
  const warn = coReadingProfileAdvice("coreading/gemini-3.8-flash-high");
  assert.equal(warn?.level, "warn");
  assert.match(warn?.message ?? "", /coreading-lite\/gemini-3\.8-flash-high/);
  assert.equal(coReadingProfileAdvice("nova/x")?.level, "warn");
  assert.equal(coReadingProfileAdvice("gpt-4o"), null);
  assert.equal(coReadingProfileAdvice("snow/x"), null);
  assert.equal(coReadingProfileAdvice(""), null);
});

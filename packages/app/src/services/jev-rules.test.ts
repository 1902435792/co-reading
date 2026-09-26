import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildJevRequest,
  buildPageState,
  decidePageGate,
  extractJevAnswers,
  normalizeJevSettings,
  pickNovaReaction,
} from "./jev-rules";

test("buildJevRequest uses the OpenRouter decisions API by default", () => {
  const request = buildJevRequest({ endpoint: "openrouter", baseUrl: "", model: "" }, "state", {});
  assert.equal(request.url, "https://openrouter.ai/api/alpha/decisions");
  assert.deepEqual(request.body, { model: "typesafe/jev-1.13", state: "state", questions: {} });
});

test("buildJevRequest wraps input for Workers AI compatible endpoints", () => {
  const request = buildJevRequest({ endpoint: "workers-ai", baseUrl: "https://x/ai/run", model: "" }, "s", {});
  assert.equal(request.url, "https://x/ai/run");
  assert.deepEqual(request.body, { model: "typesafe/jev", input: { state: "s", questions: {} } });
});

test("buildJevRequest posts the native System One body for TypeSafe endpoints", () => {
  const request = buildJevRequest({ endpoint: "typesafe", baseUrl: "https://relay/v1/systemone", model: "" }, "s", {});
  assert.equal(request.url, "https://relay/v1/systemone");
  assert.deepEqual(request.body, { model: "jev-latest", state: "s", questions: {} });
  assert.equal(normalizeJevSettings({ endpoint: "typesafe" }).endpoint, "typesafe");
});

test("extractJevAnswers accepts both response shapes", () => {
  assert.deepEqual(extractJevAnswers({ answers: { a: { noul: 1 } } }), { a: { noul: 1 } });
  assert.deepEqual(extractJevAnswers({ result: { answers: { a: { noul: 0 } } } }), { a: { noul: 0 } });
  assert.equal(extractJevAnswers({ error: "x" }), null);
});

test("decidePageGate skips confident non-body pages at every level", () => {
  const gate = decidePageGate(
    { page_kind: { choice: "front_matter", probabilities: { front_matter: 0.9 } }, worth_annotating: { noul: 0.8 } },
    "conservative",
  );
  assert.equal(gate.skip, true);
  assert.equal(gate.reason, "目录/版权页");
});

test("decidePageGate keeps body pages unless the level allows skipping dull pages", () => {
  const answers = { page_kind: { choice: "body", confidence: 0.99 }, worth_annotating: { noul: 0.1 } };
  assert.equal(decidePageGate(answers, "conservative").skip, false);
  assert.equal(decidePageGate(answers, "normal").skip, true);
  assert.equal(decidePageGate({ ...answers, worth_annotating: { noul: 0.2 } }, "normal").skip, false);
  assert.equal(decidePageGate({ ...answers, worth_annotating: { noul: 0.2 } }, "eager").skip, true);
});

test("decidePageGate does not skip uncertain page kinds", () => {
  const gate = decidePageGate({ page_kind: { choice: "other", probabilities: { other: 0.5 } } }, "eager");
  assert.equal(gate.skip, false);
});

test("pickNovaReaction maps confident choices to Nova images", () => {
  assert.deepEqual(pickNovaReaction({ reaction: { choice: "sad", confidence: 0.8 } }), {
    criteria: "悲伤、心疼、遗憾",
    mood: "error",
    image: "error-cry",
  });
  assert.equal(pickNovaReaction({ reaction: { choice: "sad", confidence: 0.2 } }), null);
  assert.equal(pickNovaReaction({ reaction: { choice: "unknown", confidence: 1 } }), null);
});

test("normalizeJevSettings keeps features off by default", () => {
  const settings = normalizeJevSettings({ endpoint: "bad", skipLevel: "x", prefilter: "yes" });
  assert.equal(settings.prefilter, false);
  assert.equal(settings.endpoint, "openrouter");
  assert.equal(settings.skipLevel, "conservative");
});

test("buildPageState prefixes the section and clips long pages", () => {
  const state = buildPageState([{ text: "a".repeat(10), sectionLabel: "第一章" }], 5);
  assert.equal(state, "章节：第一章\n\naaaaa…");
});

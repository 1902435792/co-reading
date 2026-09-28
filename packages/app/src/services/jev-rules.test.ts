import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildJevRequest,
  buildPageState,
  decidePageGate,
  extractJevAnswers,
  isPassageHard,
  normalizeJevSettings,
  pickNovaReaction,
  SENTENCE_PICK_MAX_OPTIONS,
  buildSentencePickQuestion,
  pickSentences,
  splitCandidateSentences,
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

test("isPassageHard reads the noul answer and tolerates missing data", () => {
  assert.equal(isPassageHard({ hard_to_follow: { noul: 0.8 } }), true);
  assert.equal(isPassageHard({ hard_to_follow: { probability: 0.2 } }), false);
  assert.equal(isPassageHard({}), null);
});

test("splitCandidateSentences round-robins blocks and filters length", () => {
  const candidates = splitCandidateSentences([
    { blockKey: "a", text: "这是第一段的第一句话。这是第一段的第二句话！短。" },
    { blockKey: "b", text: "这是第二段唯一的一句话？" },
  ]);
  assert.deepEqual(
    candidates.map((c) => [c.key, c.blockKey, c.text]),
    [
      ["s1", "a", "这是第一段的第一句话。"],
      ["s2", "b", "这是第二段唯一的一句话？"],
      ["s3", "a", "这是第一段的第二句话！"],
    ]
  );
  const many = splitCandidateSentences(
    Array.from({ length: 20 }, (_, i) => ({ blockKey: `k${i}`, text: `第${i}段里有一句足够长的话。` }))
  );
  assert.equal(many.length, SENTENCE_PICK_MAX_OPTIONS);
});

test("buildSentencePickQuestion offers a none option", () => {
  const question = buildSentencePickQuestion([{ key: "s1", blockKey: "a", text: "一句足够长的候选句子。" }]);
  assert.equal(question.type, "choice");
  assert.ok(question.type === "choice" && question.criteria.none);
  assert.ok(question.type === "choice" && question.criteria.s1 === "一句足够长的候选句子。");
});

test("pickSentences takes confident top picks and respects none", () => {
  const candidates = [
    { key: "s1", blockKey: "a", text: "甲句甲句甲句甲句。" },
    { key: "s2", blockKey: "a", text: "乙句乙句乙句乙句。" },
    { key: "s3", blockKey: "b", text: "丙句丙句丙句丙句。" },
  ];
  assert.deepEqual(
    pickSentences({ choice: "s2", probabilities: { s1: 0.1, s2: 0.5, s3: 0.3, none: 0.1 } }, candidates).map(
      (p) => p.key
    ),
    ["s2", "s3"]
  );
  // 第二名不到第一名的一半：只划一句。
  assert.deepEqual(
    pickSentences({ choice: "s1", probabilities: { s1: 0.7, s2: 0.21, none: 0.09 } }, candidates).map((p) => p.key),
    ["s1"]
  );
  // JEV 觉得都很普通。
  assert.deepEqual(pickSentences({ choice: "none", probabilities: { s1: 0.3, none: 0.6 } }, candidates), []);
  // 把握太低。
  assert.deepEqual(pickSentences({ choice: "s1", probabilities: { s1: 0.2, s2: 0.19 } }, candidates), []);
  // 只有 choice 没有概率。
  assert.deepEqual(pickSentences({ choice: "s3" }, candidates).map((p) => p.key), ["s3"]);
  assert.deepEqual(pickSentences(undefined, candidates), []);
});

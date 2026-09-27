import assert from "node:assert/strict";
import test from "node:test";
import {
  buildQaDiaryPayload,
  extractQaPairs,
  loadQaDiaryWritten,
  markQaDiaryWritten,
  selectUnwrittenQaPairs,
} from "./qa-diary.ts";

const msg = (id: string, role: string, ...parts: Array<{ type: string; text?: string }>) => ({ id, role, parts });

test("提问配上后面的 Nova 回答，引用也带上", () => {
  const pairs = extractQaPairs([
    msg("u1", "user", { type: "quote", text: "原文一句" }, { type: "text", text: "什么意思？" }),
    msg("a1", "assistant", { type: "reasoning", text: "想" }, { type: "text", text: "意思是……" }),
    msg("u2", "user", { type: "text", text: "没回答的" }),
    msg("u3", "user", { type: "text", text: "再问" }),
    msg("a3", "assistant", { type: "tool-x" }),
    msg("a3b", "assistant", { type: "text", text: "最终回答" }),
  ]);
  assert.deepEqual(
    pairs.map((p) => p.id),
    ["u1", "u3"],
  );
  assert.equal(pairs[0].question, "引用：「原文一句」\n什么意思？");
  assert.equal(pairs[0].answer, "意思是……");
  assert.equal(pairs[1].answer, "最终回答");
});

test("只挑没写过的最近几组", () => {
  const pairs = ["a", "b", "c", "d"].map((id) => ({ id, question: "q", answer: "a" }));
  assert.deepEqual(
    selectUnwrittenQaPairs(pairs, new Set(["d"]), 2).map((p) => p.id),
    ["b", "c"],
  );
});

test("问答日记条目满足 Bridge 日记接口要求", () => {
  const payload = buildQaDiaryPayload({
    bookTitle: " 书 ",
    pairs: [{ id: "u1", question: "为什么", answer: "因为" }],
    sectionLabel: "第二章",
    now: new Date(2026, 8, 27, 10, 5),
  });
  assert.equal(payload.bookTitle, "书");
  assert.equal(payload.selectedCount, payload.entries.length);
  assert.deepEqual(payload.sourceKeys, ["qa:u1"]);
  const entry = payload.entries[0];
  assert.equal(entry.originalText, "读者提问：为什么");
  assert.equal(entry.aiComment, "Nova 回答：因为");
  assert.equal(entry.section, "第二章");
  assert.match(entry.summary ?? "", /问答/);
  assert.throws(() => buildQaDiaryPayload({ bookTitle: "书", pairs: [] }));
});

test("已写入记录去重保存", () => {
  const data = new Map<string, string>();
  const storage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
  markQaDiaryWritten("b", ["u1", "u2"], storage);
  markQaDiaryWritten("b", ["u2", "u3"], storage);
  assert.deepEqual([...loadQaDiaryWritten("b", storage)], ["u1", "u2", "u3"]);
  assert.equal(loadQaDiaryWritten("other", storage).size, 0);
});

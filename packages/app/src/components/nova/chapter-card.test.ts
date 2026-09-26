import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAnswerGradeState,
  buildChapterCardPrompt,
  chapterCardFileName,
  chapterCardToMarkdown,
  clipChapterText,
  parseChapterCardJson,
  shouldOfferChapterCard,
} from "./chapter-card.ts";

test("shouldOfferChapterCard needs the next chapter and enough reading time", () => {
  assert.equal(shouldOfferChapterCard({ fromIndex: 2, toIndex: 3, activeMsInSection: 5 * 60_000 }), true);
  assert.equal(shouldOfferChapterCard({ fromIndex: 2, toIndex: 3, activeMsInSection: 60_000 }), false);
  assert.equal(shouldOfferChapterCard({ fromIndex: 2, toIndex: 5, activeMsInSection: 5 * 60_000 }), false);
  assert.equal(shouldOfferChapterCard({ fromIndex: 3, toIndex: 2, activeMsInSection: 5 * 60_000 }), false);
  assert.equal(shouldOfferChapterCard({ fromIndex: null, toIndex: 1, activeMsInSection: 5 * 60_000 }), false);
});

test("clipChapterText squeezes whitespace and clips", () => {
  assert.equal(clipChapterText("a  b\n\n\n c"), "a b\nc");
  assert.equal(clipChapterText("x".repeat(20), 10).length, 10);
});

test("buildChapterCardPrompt asks for strict JSON", () => {
  const { system, prompt } = buildChapterCardPrompt({ bookTitle: "书", sectionLabel: "第一章", text: "正文" });
  assert.match(system, /只输出一个 JSON 对象/);
  assert.match(prompt, /章节：第一章/);
  assert.match(prompt, /本章正文：\n正文$/);
});

test("parseChapterCardJson tolerates code fences and drops bad questions", () => {
  const text =
    '好的：\n```json\n{"summary":"小结","points":["一","二",""],"questions":[{"question":"问","answer":"答"},{"question":"缺答案"}]}\n```';
  assert.deepEqual(parseChapterCardJson(text), {
    summary: "小结",
    points: ["一", "二"],
    questions: [{ question: "问", answer: "答" }],
  });
  assert.equal(parseChapterCardJson("没有 JSON"), null);
  assert.equal(parseChapterCardJson("{broken"), null);
  assert.equal(parseChapterCardJson('{"summary":""}'), null);
});

test("chapterCardToMarkdown includes my answers and a safe file name", () => {
  const card = {
    id: "c1",
    bookId: "b",
    bookTitle: "系统之美",
    sectionIndex: 3,
    sectionLabel: "第三章: 反馈",
    createdAt: Date.UTC(2026, 8, 27),
    summary: "小结",
    points: ["要点"],
    questions: [{ question: "问题", answer: "答案" }],
  };
  const markdown = chapterCardToMarkdown(card, ["我的想法"]);
  assert.match(markdown, /^---\ntitle: "系统之美 · 第三章: 反馈"/);
  assert.match(markdown, /date: 2026-09-27/);
  assert.match(markdown, /1\. 问题\n {3}- 我的回答：我的想法\n {3}- 参考答案：答案/);
  assert.equal(chapterCardFileName(card), "系统之美-第三章_ 反馈-章末卡片");
});

test("buildAnswerGradeState lays out question, reference and answer", () => {
  assert.equal(buildAnswerGradeState(" 问 ", "答", "我答"), "问题：问\n\n参考答案：答\n\n读者的回答：我答");
});

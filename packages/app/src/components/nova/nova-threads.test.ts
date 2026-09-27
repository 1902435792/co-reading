import assert from "node:assert/strict";
import test from "node:test";
import {
  appendNoteThreadMessage,
  appendThreadToComment,
  buildNoteThreadReplyPrompt,
  cleanNoteThreadReply,
  formatNoteThreadForDiary,
  getNoteThread,
  parseNoteThreads,
  saveNoteThreadMessage,
} from "./nova-threads.ts";

const memory = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
};

test("评论区追加消息，线程和书级都有上限", () => {
  let threads = {};
  for (let i = 0; i < 5; i += 1) {
    threads = appendNoteThreadMessage(threads, "a", { role: "reader", text: `m${i}`, at: i }, { perThread: 3 });
  }
  assert.deepEqual(
    (threads as Record<string, { text: string }[]>).a.map((m) => m.text),
    ["m2", "m3", "m4"],
  );
  let book = {};
  for (const id of ["x", "y", "z"]) {
    book = appendNoteThreadMessage(book, id, { role: "nova", text: id, at: 1 }, { perBook: 2 });
  }
  assert.deepEqual(Object.keys(book), ["y", "z"]);
  assert.equal(appendNoteThreadMessage(book, "q", { role: "reader", text: "   ", at: 1 }), book);
});

test("坏数据被过滤", () => {
  assert.deepEqual(parseNoteThreads("not json"), {});
  assert.deepEqual(
    parseNoteThreads(JSON.stringify({ a: [{ role: "reader", text: "hi", at: 1 }, { role: "x" }], b: "bad" })),
    { a: [{ role: "reader", text: "hi", at: 1 }] },
  );
});

test("共读日记里带上评论区", () => {
  assert.equal(formatNoteThreadForDiary([]), "");
  assert.equal(appendThreadToComment("边注", undefined), "边注");
  const text = appendThreadToComment("边注", [
    { role: "reader", text: "我不同意", at: 1 },
    { role: "nova", text: "说说看？", at: 2 },
  ]);
  assert.equal(text, "边注\n\n评论区：\n读者：我不同意\nNova：说说看？");
  const many = Array.from({ length: 15 }, (_, i) => ({ role: "reader" as const, text: `t${i}`, at: i }));
  const out = formatNoteThreadForDiary(many);
  assert.match(out, /前面还有 3 条/);
  assert.ok(!out.includes("读者：t2\n"));
  assert.ok(out.endsWith("读者：t14"));
});

test("回复提示词带原文、边注和对话，清洗回复", () => {
  const { system, prompt } = buildNoteThreadReplyPrompt({
    bookTitle: "书",
    sectionLabel: "第一章",
    quote: "原文句子",
    comment: "我的边注",
    thread: [{ role: "reader", text: "为什么？", at: 1 }],
  });
  assert.match(system, /Nova/);
  assert.match(prompt, /原文：原文句子/);
  assert.match(prompt, /你的边注：我的边注/);
  assert.match(prompt, /读者：为什么？/);
  assert.equal(cleanNoteThreadReply("Nova：「因为这样。」"), "因为这样。");
});

test("存储按书按边注读写", () => {
  const storage = memory();
  saveNoteThreadMessage("book", "n1", { role: "reader", text: "你好", at: 1 }, storage);
  saveNoteThreadMessage("book", "n1", { role: "nova", text: "嗨", at: 2 }, storage);
  assert.equal(getNoteThread("book", "n1", storage).length, 2);
  assert.equal(getNoteThread("other", "n1", storage).length, 0);
});

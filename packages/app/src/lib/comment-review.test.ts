import assert from "node:assert/strict";
import test from "node:test";
import type { BookNote } from "../types/book.ts";
import {
  buildAnnotationThreads,
  guessReviewMode,
  isBookReviewPost,
  loadNotepadOrder,
  loadReviewModes,
  saveNotepadOrder,
  saveReviewMode,
  threadTranscript,
} from "./comment-review.ts";

const note = (id: string, createdAt: number, extra: Partial<BookNote> = {}): BookNote => ({
  id,
  type: "annotation",
  cfi: `epubcfi(/6/2!/4/${id})`,
  note: "",
  createdAt,
  updatedAt: createdAt,
  ...extra,
});

const memoryStorage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
};

test("guessReviewMode：疑问解释、其余感受、空评论交给 Nova", () => {
  assert.equal(guessReviewMode("这里为什么突然转折？"), "explain");
  assert.equal(guessReviewMode("没懂作者的意思"), "explain");
  assert.equal(guessReviewMode("读到这里好难过"), "feel");
  assert.equal(guessReviewMode("   "), undefined);
});

test("buildAnnotationThreads：回评挂在原划线下，最新在上", () => {
  const a = note("a", 100);
  const b = note("b", 200);
  const c = note("c", 300);
  const replyToA = note("r", 400, { author: "ai", sourceNoteId: "a" });
  const orphan = note("o", 50, { author: "ai", sourceNoteId: "missing" });
  const threads = buildAnnotationThreads([a, b, c, replyToA, orphan], "newest");
  assert.deepEqual(
    threads.map((thread) => thread.top.id),
    ["a", "c", "b", "o"],
  );
  assert.deepEqual(
    threads[0]!.replies.map((reply) => reply.id),
    ["r"],
  );
  const byPosition = buildAnnotationThreads([a, b, c, replyToA, orphan], "position");
  assert.deepEqual(
    byPosition.map((thread) => thread.top.id),
    ["a", "b", "c", "o"],
  );
});

test("buildAnnotationThreads：我的楼中回复也进楼，整书书评单独成帖", () => {
  const a = note("a", 100, { note: "这里什么意思？" });
  const nova = note("n", 200, { author: "ai", sourceNoteId: "a", note: "意思是……" });
  const mine = note("m", 300, { type: "review", author: "human", sourceNoteId: "a", note: "懂了，那后面呢" });
  const post = note("p", 250, { type: "review", author: "human", cfi: "", note: "整本书读下来很压抑" });
  const threads = buildAnnotationThreads([a, nova, mine, post], "newest");
  assert.deepEqual(
    threads.map((thread) => thread.top.id),
    ["a", "p"],
  );
  assert.deepEqual(
    threads[0]!.replies.map((reply) => reply.id),
    ["n", "m"],
  );
  assert.equal(threads[0]!.latest, 300);
  assert.equal(isBookReviewPost(post), true);
  assert.equal(isBookReviewPost(mine), false);
  assert.equal(isBookReviewPost(a), false);
});

test("threadTranscript：楼层变成对话，只划线的楼主用占位，空楼跳过，保留最近几楼", () => {
  const top = note("t", 1);
  const replies = [
    note("r1", 2, { author: "ai", sourceNoteId: "t", note: "第一楼回评" }),
    note("r2", 3, { type: "review", sourceNoteId: "t", note: "  " }),
    note("r3", 4, { type: "review", sourceNoteId: "t", note: "我的追问" }),
    note("r4", 5, { type: "review", author: "ai", sourceNoteId: "t", note: "Nova 再答" }),
  ];
  assert.deepEqual(threadTranscript({ top, replies }), [
    { speaker: "reader", text: "（划了这句）" },
    { speaker: "nova", text: "第一楼回评" },
    { speaker: "reader", text: "我的追问" },
    { speaker: "nova", text: "Nova 再答" },
  ]);
  assert.deepEqual(
    threadTranscript({ top, replies }, 3).map((turn) => turn.text),
    ["（划了这句）", "我的追问", "Nova 再答"],
  );
  const aiTop = note("x", 1, { author: "ai", note: "Nova 共读边注" });
  assert.deepEqual(threadTranscript({ top: aiTop, replies: [] }), [{ speaker: "nova", text: "Nova 共读边注" }]);
});

test("回评方式与排序偏好可以保存", () => {
  const storage = memoryStorage();
  saveReviewMode("n1", "explain", storage);
  saveReviewMode("n2", "feel", storage);
  assert.deepEqual(loadReviewModes(storage), { n1: "explain", n2: "feel" });
  assert.equal(loadNotepadOrder(storage), "newest");
  saveNotepadOrder("position", storage);
  assert.equal(loadNotepadOrder(storage), "position");
});

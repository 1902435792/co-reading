import assert from "node:assert/strict";
import test from "node:test";
import type { BookNote } from "../types/book.ts";
import {
  buildAnnotationThreads,
  guessReviewMode,
  loadNotepadOrder,
  loadReviewModes,
  saveNotepadOrder,
  saveReviewMode,
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

test("回评方式与排序偏好可以保存", () => {
  const storage = memoryStorage();
  saveReviewMode("n1", "explain", storage);
  saveReviewMode("n2", "feel", storage);
  assert.deepEqual(loadReviewModes(storage), { n1: "explain", n2: "feel" });
  assert.equal(loadNotepadOrder(storage), "newest");
  saveNotepadOrder("position", storage);
  assert.equal(loadNotepadOrder(storage), "position");
});

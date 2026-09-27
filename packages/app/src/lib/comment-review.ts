import type { BookNote } from "../types/book.ts";

/** 读者评论后 Nova 的回评方式：explain 解释，feel 感受。 */
export type CommentReviewMode = "explain" | "feel";

export const REVIEW_MODE_LABEL: Record<CommentReviewMode, string> = {
  explain: "解释",
  feel: "感受",
};

const QUESTION_PATTERN =
  /[?？]|为什么|为何|什么意思|啥意思|怎么理解|如何理解|不懂|没懂|看不懂|读不懂|是指|指的是|何意|求解释/;

/** Jev 没法判断时的兜底：评论里有疑问就解释，否则说感受；没写评论交给 Nova 自己把握。 */
export function guessReviewMode(comment: string): CommentReviewMode | undefined {
  const text = comment.trim();
  if (!text) return undefined;
  return QUESTION_PATTERN.test(text) ? "explain" : "feel";
}

interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const REVIEW_MODES_KEY = "deepreader:review-modes";
const MAX_REMEMBERED_MODES = 2_000;

function defaultStorage(): KeyValueStorage | undefined {
  return typeof localStorage === "undefined" ? undefined : localStorage;
}

export function loadReviewModes(storage = defaultStorage()): Record<string, CommentReviewMode> {
  if (!storage) return {};
  try {
    const parsed = JSON.parse(storage.getItem(REVIEW_MODES_KEY) ?? "{}") as Record<string, unknown>;
    const result: Record<string, CommentReviewMode> = {};
    for (const [id, mode] of Object.entries(parsed)) {
      if (mode === "explain" || mode === "feel") result[id] = mode;
    }
    return result;
  } catch {
    return {};
  }
}

export function saveReviewMode(noteId: string, mode: CommentReviewMode, storage = defaultStorage()) {
  if (!storage) return;
  const modes = loadReviewModes(storage);
  delete modes[noteId];
  modes[noteId] = mode;
  const entries = Object.entries(modes).slice(-MAX_REMEMBERED_MODES);
  storage.setItem(REVIEW_MODES_KEY, JSON.stringify(Object.fromEntries(entries)));
}

// ---------- 批注栏：按线程组织（我的划线/评论 + Nova 的回评） ----------

export type NotepadOrder = "newest" | "position";

export interface AnnotationThread {
  top: BookNote;
  /** Nova 针对这条划线的回评（sourceNoteId 指向 top）。 */
  replies: BookNote[];
  /** 线程里最近一次变动的时间，「最新在上」按它排序。 */
  latest: number;
}

const touchedAt = (note: BookNote) => Math.max(note.createdAt ?? 0, note.updatedAt ?? 0);

/**
 * annotations 需已按阅读位置排好；order 为 newest 时按线程最近变动倒序（越往上越新），
 * 为 position 时保持阅读位置顺序。找不到原划线的回评单独成条。
 */
export function buildAnnotationThreads(annotations: readonly BookNote[], order: NotepadOrder): AnnotationThread[] {
  const ids = new Set(annotations.map((note) => note.id));
  const replies = new Map<string, BookNote[]>();
  const tops: BookNote[] = [];
  for (const note of annotations) {
    if (note.author === "ai" && note.sourceNoteId && ids.has(note.sourceNoteId)) {
      const list = replies.get(note.sourceNoteId) ?? [];
      list.push(note);
      replies.set(note.sourceNoteId, list);
    } else {
      tops.push(note);
    }
  }
  const threads = tops.map((top) => {
    const threadReplies = (replies.get(top.id) ?? []).sort((a, b) => a.createdAt - b.createdAt);
    const latest = Math.max(touchedAt(top), ...threadReplies.map(touchedAt));
    return { top, replies: threadReplies, latest };
  });
  if (order === "newest") {
    // 稳定排序：同一时间的保持阅读位置顺序
    return threads
      .map((thread, index) => ({ thread, index }))
      .sort((a, b) => b.thread.latest - a.thread.latest || a.index - b.index)
      .map(({ thread }) => thread);
  }
  return threads;
}

const NOTEPAD_ORDER_KEY = "deepreader:notepad-order";

export function loadNotepadOrder(storage = defaultStorage()): NotepadOrder {
  return storage?.getItem(NOTEPAD_ORDER_KEY) === "position" ? "position" : "newest";
}

export function saveNotepadOrder(order: NotepadOrder, storage = defaultStorage()) {
  storage?.setItem(NOTEPAD_ORDER_KEY, order);
}

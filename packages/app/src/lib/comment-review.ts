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

// ---------- 书评区：按帖子组织（楼主 = 划线 / Nova 共读边注 / 整书书评，楼层 = 回复） ----------

export type NotepadOrder = "newest" | "position";

/** 楼层回复与整书书评用 review 类型存，不画到书页上。 */
export const REVIEW_NOTE_TYPE = "review" as const;

export function isBookReviewPost(note: BookNote): boolean {
  return note.type === REVIEW_NOTE_TYPE && !note.sourceNoteId;
}

export interface AnnotationThread {
  top: BookNote;
  /** 楼层：Nova 回评与双方的楼中回复（sourceNoteId 指向 top），按时间正序。 */
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
    if (note.sourceNoteId && ids.has(note.sourceNoteId)) {
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

export interface ThreadTurn {
  speaker: "reader" | "nova";
  text: string;
}

/**
 * 把一个帖子整理成对话记录，给 Nova 接着回复用。楼主是只划线没写评论时，用「（划了这句）」占位；
 * 空楼层跳过；只保留最近 maxTurns 楼（楼主始终保留）。
 */
export function threadTranscript(thread: Pick<AnnotationThread, "top" | "replies">, maxTurns = 12): ThreadTurn[] {
  const toTurn = (note: BookNote): ThreadTurn | null => {
    const text = note.note?.trim() ?? "";
    const speaker = note.author === "ai" ? "nova" : "reader";
    if (text) return { speaker, text };
    return note === thread.top && note.type === "annotation" && speaker === "reader"
      ? { speaker, text: "（划了这句）" }
      : null;
  };
  const first = toTurn(thread.top);
  const rest = thread.replies.map(toTurn).filter((turn): turn is ThreadTurn => turn !== null);
  const tail = rest.slice(-Math.max(0, maxTurns - (first ? 1 : 0)));
  return first ? [first, ...tail] : tail;
}

const NOTEPAD_ORDER_KEY = "deepreader:notepad-order";

export function loadNotepadOrder(storage = defaultStorage()): NotepadOrder {
  return storage?.getItem(NOTEPAD_ORDER_KEY) === "position" ? "position" : "newest";
}

export function saveNotepadOrder(order: NotepadOrder, storage = defaultStorage()) {
  storage?.setItem(NOTEPAD_ORDER_KEY, order);
}

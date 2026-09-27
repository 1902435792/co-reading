import {
  type CoReadingDiaryEntry,
  type CoReadingDiaryPayload,
  formatCoReadingDiaryDateTime,
} from "./co-reading-diary.ts";

/** 问答日记：把问答 Agent 里的「提问 + Nova 回答」整理成日记条目，走同一个 VCP 日记接口。 */

export const QA_DIARY_DEFAULT_COUNT = 6;
export const QA_DIARY_COUNT_PRESETS = [3, 6, 10, 20] as const;
export const QA_DIARY_MAX_COUNT = 30;
export const QA_DIARY_WRITTEN_LIMIT = 3_000;
const QUESTION_LIMIT = 1_500;
const ANSWER_LIMIT = 2_400;

export interface QaMessageLike {
  id: string;
  role: string;
  parts?: ReadonlyArray<{ type: string; text?: unknown }>;
}

export interface QaPair {
  /** 用提问消息的 id 作为这组问答的身份 */
  id: string;
  question: string;
  answer: string;
}

function clip(text: string, max: number): string {
  const value = text.trim();
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function partsText(message: QaMessageLike, type: string): string[] {
  return (message.parts ?? [])
    .filter((part) => part.type === type && typeof part.text === "string")
    .map((part) => (part.text as string).trim())
    .filter(Boolean);
}

function questionText(message: QaMessageLike): string {
  const quotes = partsText(message, "quote");
  const text = partsText(message, "text").join("\n");
  const quoteBlock = quotes.map((quote) => `引用：「${clip(quote, 500)}」`).join("\n");
  return [quoteBlock, text].filter(Boolean).join("\n");
}

/** 每条提问配上它后面的最后一条有文字的 Nova 回答；缺任一边的跳过。 */
export function extractQaPairs(messages: ReadonlyArray<QaMessageLike>): QaPair[] {
  const pairs: QaPair[] = [];
  for (let i = 0; i < messages.length; i += 1) {
    const message = messages[i];
    if (message.role !== "user") continue;
    const question = questionText(message);
    let answer = "";
    for (let j = i + 1; j < messages.length && messages[j].role !== "user"; j += 1) {
      if (messages[j].role !== "assistant") continue;
      const text = partsText(messages[j], "text").join("\n");
      if (text) answer = text;
    }
    if (question && answer) pairs.push({ id: message.id, question, answer });
  }
  return pairs;
}

export function selectUnwrittenQaPairs(
  pairs: ReadonlyArray<QaPair>,
  written: ReadonlySet<string>,
  count: number,
): QaPair[] {
  const limit = Math.max(1, Math.min(QA_DIARY_MAX_COUNT, Math.floor(count) || 1));
  return pairs.filter((pair) => !written.has(pair.id)).slice(-limit);
}

export function buildQaDiaryPayload(options: {
  bookTitle: string;
  pairs: ReadonlyArray<QaPair>;
  sectionLabel?: string | null;
  now?: Date;
}): CoReadingDiaryPayload {
  const title = options.bookTitle.trim();
  if (!title) throw new Error("缺少书名，无法写问答日记");
  if (options.pairs.length === 0) throw new Error("当前对话里没有新的问答可写");
  const now = options.now ?? new Date();
  const section = options.sectionLabel?.trim() || null;
  const time = now.getTime();
  const entries = options.pairs.map((pair): CoReadingDiaryEntry => {
    const originalText = `读者提问：${clip(pair.question, QUESTION_LIMIT)}`;
    const aiComment = `Nova 回答：${clip(pair.answer, ANSWER_LIMIT)}`;
    return {
      sourceKey: `qa:${pair.id}`,
      sourceAnnotationId: null,
      originalText,
      text: originalText,
      aiComment,
      comment: aiComment,
      summary: "问答对话（读者在问答 Agent 里和 Nova 的对话）",
      section,
      sectionLabel: section,
      sectionIndex: 0,
      position: section ?? "问答",
      cfi: null,
      page: null,
      task: "qa",
      time,
      createdAt: time,
    };
  });
  return {
    bookTitle: title,
    ...formatCoReadingDiaryDateTime(now),
    selectedCount: entries.length,
    sourceKeys: entries.map((entry) => entry.sourceKey),
    entries,
  };
}

// ---------- 已写入记录（本机） ----------

interface LedgerStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): LedgerStorage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function qaDiaryWrittenKey(bookId: string): string {
  return `deepreader:qa-diary-written:${bookId}`;
}

export function loadQaDiaryWritten(bookId: string, storage = defaultStorage()): Set<string> {
  if (!storage) return new Set();
  try {
    const data = JSON.parse(storage.getItem(qaDiaryWrittenKey(bookId)) ?? "[]") as unknown;
    return new Set(Array.isArray(data) ? data.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

export function markQaDiaryWritten(
  bookId: string,
  ids: ReadonlyArray<string>,
  storage = defaultStorage(),
): Set<string> {
  const written = loadQaDiaryWritten(bookId, storage);
  for (const id of ids) {
    written.delete(id);
    written.add(id);
  }
  const list = [...written].slice(-QA_DIARY_WRITTEN_LIMIT);
  storage?.setItem(qaDiaryWrittenKey(bookId), JSON.stringify(list));
  return new Set(list);
}

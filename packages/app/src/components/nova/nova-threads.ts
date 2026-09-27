/**
 * Nova 边注评论区：读者可以在 Nova 的边注下回复，Nova 接着回。
 * 纯函数 + localStorage 存储（按书分 key，按边注 id 分组）。
 */

export type NoteThreadRole = "reader" | "nova";

export interface NoteThreadMessage {
  role: NoteThreadRole;
  text: string;
  at: number;
}

export type NoteThreads = Record<string, NoteThreadMessage[]>;

export const NOTE_THREAD_MESSAGE_LIMIT = 40;
export const NOTE_THREAD_BOOK_LIMIT = 300;
export const NOTE_THREAD_TEXT_LIMIT = 1_200;
export const NOTE_THREAD_DIARY_LIMIT = 12;
export const NOTE_THREAD_EVENT = "deepreader:note-thread-change";

export function noteThreadsKey(bookId: string): string {
  return `deepreader:note-threads:${bookId}`;
}

function clip(text: string, max: number): string {
  const value = text.trim();
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function isMessage(value: unknown): value is NoteThreadMessage {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    (item.role === "reader" || item.role === "nova") &&
    typeof item.text === "string" &&
    item.text.trim().length > 0 &&
    typeof item.at === "number"
  );
}

export function parseNoteThreads(raw: string | null): NoteThreads {
  if (!raw) return {};
  try {
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    const threads: NoteThreads = {};
    for (const [id, list] of Object.entries(data as Record<string, unknown>)) {
      if (!Array.isArray(list)) continue;
      const messages = list.filter(isMessage);
      if (messages.length > 0) threads[id] = messages;
    }
    return threads;
  } catch {
    return {};
  }
}

/** 追加一条消息；最近活跃的线程排在最后，超出书级上限时丢掉最久没动的。 */
export function appendNoteThreadMessage(
  threads: NoteThreads,
  annotationId: string,
  message: NoteThreadMessage,
  limits: { perThread?: number; perBook?: number } = {},
): NoteThreads {
  const text = clip(message.text, NOTE_THREAD_TEXT_LIMIT);
  if (!annotationId || !text) return threads;
  const perThread = limits.perThread ?? NOTE_THREAD_MESSAGE_LIMIT;
  const perBook = limits.perBook ?? NOTE_THREAD_BOOK_LIMIT;
  const { [annotationId]: previous = [], ...rest } = threads;
  const nextThread = [...previous, { ...message, text }].slice(-perThread);
  const ids = Object.keys(rest);
  const keep = ids.slice(Math.max(0, ids.length - (perBook - 1)));
  const next: NoteThreads = {};
  for (const id of keep) next[id] = rest[id];
  next[annotationId] = nextThread;
  return next;
}

/** 写进共读日记的评论区文本；没有对话时返回空串。 */
export function formatNoteThreadForDiary(
  messages: NoteThreadMessage[] | undefined,
  max = NOTE_THREAD_DIARY_LIMIT,
): string {
  if (!messages || messages.length === 0) return "";
  const lines = messages
    .slice(-max)
    .map((item) => `${item.role === "reader" ? "读者" : "Nova"}：${clip(item.text, 400)}`);
  const omitted = messages.length > max ? `（前面还有 ${messages.length - max} 条）\n` : "";
  return `评论区：\n${omitted}${lines.join("\n")}`;
}

export function appendThreadToComment(comment: string, messages: NoteThreadMessage[] | undefined): string {
  const thread = formatNoteThreadForDiary(messages);
  return thread ? `${comment}\n\n${thread}` : comment;
}

export interface NoteThreadPromptInput {
  bookTitle?: string;
  sectionLabel?: string;
  quote: string;
  comment: string;
  thread: NoteThreadMessage[];
}

export function buildNoteThreadReplyPrompt(input: NoteThreadPromptInput): { system: string; prompt: string } {
  const system = [
    "你是 Nova，读者的共读伙伴。之前你在书页边上给一段原文写了边注，现在读者在这条边注下面回复你，你们像评论区那样聊。",
    "要求：",
    "- 只回复这一条，30–220 字，口吻自然、具体，贴着原文和你的边注说话；",
    "- 读者反驳你时认真回应，可以承认没想到的地方，也可以坚持并给出理由；",
    "- 不要复述原文，不要加标题、列表、引号或「Nova：」前缀；",
    "- 不要调用工具，不要写日记，只输出回复正文。",
  ].join("\n");
  const history = input.thread
    .slice(-16)
    .map((item) => `${item.role === "reader" ? "读者" : "Nova"}：${clip(item.text, 600)}`)
    .join("\n");
  const prompt = [
    input.bookTitle ? `书名：《${input.bookTitle}》` : "",
    input.sectionLabel ? `章节：${input.sectionLabel}` : "",
    `原文：${clip(input.quote, 800)}`,
    `你的边注：${clip(input.comment, 600)}`,
    "",
    "评论区：",
    history,
    "",
    "请以 Nova 的身份回复读者最后一条。",
  ]
    .filter((line, index) => line !== "" || index > 2)
    .join("\n");
  return { system, prompt };
}

export function cleanNoteThreadReply(text: string): string {
  let value = text.trim();
  value = value.replace(/^```[a-z]*\s*|\s*```$/gi, "").trim();
  value = value.replace(/^(nova|Nova|NOVA)\s*[：:]\s*/, "").trim();
  value = value.replace(/^[“"「](.*)[”"」]$/s, "$1").trim();
  return clip(value, 600);
}

// ---------- 存储 ----------

interface ThreadStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): ThreadStorage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function loadNoteThreads(bookId: string, storage = defaultStorage()): NoteThreads {
  if (!bookId || !storage) return {};
  return parseNoteThreads(storage.getItem(noteThreadsKey(bookId)));
}

export function getNoteThread(bookId: string, annotationId: string, storage = defaultStorage()): NoteThreadMessage[] {
  return loadNoteThreads(bookId, storage)[annotationId] ?? [];
}

export function hasNoteThread(bookId: string, annotationId: string, storage = defaultStorage()): boolean {
  return getNoteThread(bookId, annotationId, storage).length > 0;
}

export function saveNoteThreadMessage(
  bookId: string,
  annotationId: string,
  message: NoteThreadMessage,
  storage = defaultStorage(),
): NoteThreadMessage[] {
  if (!bookId || !storage) return [];
  const next = appendNoteThreadMessage(loadNoteThreads(bookId, storage), annotationId, message);
  try {
    storage.setItem(noteThreadsKey(bookId), JSON.stringify(next));
  } catch {
    // 存储满了也不影响本次对话显示
  }
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    window.dispatchEvent(new CustomEvent(NOTE_THREAD_EVENT, { detail: { bookId, annotationId } }));
  }
  return next[annotationId] ?? [];
}

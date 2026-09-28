import { validateCoReadingReviewResult } from "@/lib/co-reading-core";
import {
  type AnnotationThread,
  type CommentReviewMode,
  REVIEW_NOTE_TYPE,
  guessReviewMode,
  saveReviewMode,
  threadTranscript,
} from "@/lib/comment-review";
import type { useReaderStoreApi } from "@/pages/reader/components/reader-provider";
import { createBookNote, getBookNotes, updateBookNote } from "@/services/book-note-service";
import { requestCoReadingReview, requestCoReadingThreadReply } from "@/services/co-reading-ai-service";
import { getCoReadingSnapshot } from "@/services/co-reading-service";
import { chooseCommentReviewModeWithJev } from "@/services/jev-service";
import type { BookNote } from "@/types/book";
import type { QueryClient } from "@tanstack/react-query";

type ReaderStoreApi = ReturnType<typeof useReaderStoreApi>;

export interface CommentReviewOutcome {
  saved: BookNote;
  existed: boolean;
  mode?: CommentReviewMode;
  /** mode 由谁定的：Jev 判断，还是按评论内容兜底。 */
  decidedBy: "jev" | "guess" | "none";
}

export function canReviewNote(note: BookNote): boolean {
  return note.type === "annotation" && note.author !== "ai" && !note.deletedAt && Boolean(note.text?.trim());
}

/**
 * 针对读者自己的划线 / 评论生成（或重新生成）Nova 回评，回评用 sourceNoteId 双向关联到原划线。
 * 先让 Jev 判断「解释」还是「感受」，Jev 不可用时按评论内容兜底。
 */
export async function generateCommentReview({
  bookId,
  source,
  readerStore,
  queryClient,
}: {
  bookId: string;
  source: BookNote;
  readerStore: ReaderStoreApi;
  queryClient: QueryClient;
}): Promise<CommentReviewOutcome> {
  if (!canReviewNote(source)) throw new Error("Nova 回评只适用于你自己的划线或评论");
  const humanNote = source.note ?? "";
  const [settingsSnapshot, notes, jevMode] = await Promise.all([
    getCoReadingSnapshot(bookId),
    getBookNotes(bookId),
    chooseCommentReviewModeWithJev(source.text ?? "", humanNote),
  ]);
  const guessed = jevMode ? undefined : guessReviewMode(humanNote);
  const mode = jevMode ?? guessed;
  const decidedBy: CommentReviewOutcome["decidedBy"] = jevMode ? "jev" : guessed ? "guess" : "none";

  const existing = notes.find(
    (note) => note.type === "annotation" && note.author === "ai" && note.sourceNoteId === source.id && !note.deletedAt,
  );
  const recentAiAnnotations = notes
    .filter((note) => note.type === "annotation" && note.author === "ai" && !note.deletedAt && note.id !== existing?.id)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 8)
    .map((note) => `“${note.text ?? ""}” ${note.note}`);
  const result = await requestCoReadingReview(
    {
      text: source.text ?? "",
      contextBefore: source.context?.before ?? "",
      contextAfter: source.context?.after ?? "",
      humanNote,
      rollingSummary: settingsSnapshot.settings.rollingSummary,
      recentAiAnnotations,
      reviewMode: mode,
    },
    settingsSnapshot.settings,
  );
  const review = validateCoReadingReviewResult(result);
  const saved = existing
    ? await updateBookNote(existing.id, { note: review })
    : await createBookNote({
        bookId,
        type: "annotation",
        cfi: source.cfi,
        text: source.text,
        style: "underline",
        color: "blue",
        author: "ai",
        sourceNoteId: source.id,
        note: review,
        context: source.context,
      });
  if (mode) saveReviewMode(saved.id, mode);

  const readerState = readerStore.getState();
  if (readerState.bookId === bookId) {
    const view = readerState.view;
    const currentNotes = readerState.config?.booknotes ?? notes;
    const nextNotes = currentNotes.some((note) => note.id === saved.id)
      ? currentNotes.map((note) => (note.id === saved.id ? saved : note))
      : [...currentNotes, saved];
    if (existing) await view?.addAnnotation(existing, true);
    await view?.addAnnotation(saved);
    const updatedConfig = readerStore.getState().updateBooknotes(nextNotes);
    if (updatedConfig) await readerStore.getState().saveConfig(updatedConfig);
  }
  await queryClient.invalidateQueries({ queryKey: ["annotations", bookId] });
  return { saved, existed: Boolean(existing), mode, decidedBy };
}

// ---------- 书评区：整书书评、楼中回复、Nova 接着回 ----------

/** 书评区的新笔记（review 类型，不画到书页上）同步进阅读器配置并刷新列表。 */
async function commitReviewNote(
  bookId: string,
  saved: BookNote,
  readerStore: ReaderStoreApi,
  queryClient: QueryClient,
) {
  const readerState = readerStore.getState();
  if (readerState.bookId === bookId) {
    const currentNotes = readerState.config?.booknotes ?? [];
    const nextNotes = currentNotes.some((note) => note.id === saved.id)
      ? currentNotes.map((note) => (note.id === saved.id ? saved : note))
      : [...currentNotes, saved];
    const updatedConfig = readerState.updateBooknotes(nextNotes);
    if (updatedConfig) await readerState.saveConfig(updatedConfig);
  }
  await queryClient.invalidateQueries({ queryKey: ["annotations", bookId] });
}

/** 发一条整本书的书评帖（不针对具体句子），位置记为发帖时读到的地方。 */
export async function postBookReview({
  bookId,
  text,
  readerStore,
  queryClient,
}: {
  bookId: string;
  text: string;
  readerStore: ReaderStoreApi;
  queryClient: QueryClient;
}): Promise<BookNote> {
  const content = text.trim();
  if (!content) throw new Error("书评内容不能为空");
  const readerState = readerStore.getState();
  const cfi = readerState.bookId === bookId ? (readerState.progress?.location ?? "") : "";
  const saved = await createBookNote({
    bookId,
    type: REVIEW_NOTE_TYPE,
    cfi,
    text: "",
    author: "human",
    sourceNoteId: null,
    note: content,
  });
  await commitReviewNote(bookId, saved, readerStore, queryClient);
  return saved;
}

/** 在帖子里回一楼（读者自己）。 */
export async function postThreadReply({
  bookId,
  top,
  text,
  readerStore,
  queryClient,
}: {
  bookId: string;
  top: BookNote;
  text: string;
  readerStore: ReaderStoreApi;
  queryClient: QueryClient;
}): Promise<BookNote> {
  const content = text.trim();
  if (!content) throw new Error("回复内容不能为空");
  const saved = await createBookNote({
    bookId,
    type: REVIEW_NOTE_TYPE,
    cfi: top.cfi ?? "",
    text: top.text ?? "",
    author: "human",
    sourceNoteId: top.id,
    note: content,
    context: top.context,
  });
  await commitReviewNote(bookId, saved, readerStore, queryClient);
  return saved;
}

/** Nova 结合前面几楼接着回复，新楼层挂在帖子下面。 */
export async function generateThreadReply({
  bookId,
  thread,
  readerStore,
  queryClient,
}: {
  bookId: string;
  thread: Pick<AnnotationThread, "top" | "replies">;
  readerStore: ReaderStoreApi;
  queryClient: QueryClient;
}): Promise<BookNote> {
  const turns = threadTranscript(thread);
  if (turns.length === 0) throw new Error("这个帖子还没有内容，先写点什么吧");
  const { top } = thread;
  const readerState = readerStore.getState();
  const book = readerState.bookId === bookId ? readerState.bookData?.book : null;
  const settingsSnapshot = await getCoReadingSnapshot(bookId);
  const result = await requestCoReadingThreadReply(
    {
      bookTitle: book?.title ?? "",
      bookAuthor: book?.author ?? "",
      quote: top.type === "annotation" ? (top.text ?? "") : "",
      contextBefore: top.context?.before ?? "",
      contextAfter: top.context?.after ?? "",
      turns,
      rollingSummary: settingsSnapshot.settings.rollingSummary,
    },
    settingsSnapshot.settings,
  );
  const reply = validateCoReadingReviewResult(result);
  const saved = await createBookNote({
    bookId,
    type: REVIEW_NOTE_TYPE,
    cfi: top.cfi ?? "",
    text: top.text ?? "",
    author: "ai",
    sourceNoteId: top.id,
    note: reply,
    context: top.context,
  });
  await commitReviewNote(bookId, saved, readerStore, queryClient);
  return saved;
}

import { type CommentReviewMode, guessReviewMode, saveReviewMode } from "@/lib/comment-review";
import { validateCoReadingReviewResult } from "@/lib/co-reading-core";
import type { useReaderStoreApi } from "@/pages/reader/components/reader-provider";
import { createBookNote, getBookNotes, updateBookNote } from "@/services/book-note-service";
import { requestCoReadingReview } from "@/services/co-reading-ai-service";
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
  return note.author !== "ai" && !note.deletedAt && Boolean(note.text?.trim());
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

  const existing = notes.find((note) => note.author === "ai" && note.sourceNoteId === source.id && !note.deletedAt);
  const recentAiAnnotations = notes
    .filter((note) => note.author === "ai" && !note.deletedAt && note.id !== existing?.id)
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

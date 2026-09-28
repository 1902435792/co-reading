import { sortAnnotationsByReadingOrder } from "@/lib/annotation-order";
import { type AnnotationThread, REVIEW_MODE_LABEL, REVIEW_NOTE_TYPE } from "@/lib/comment-review";
import { deleteBookNote, getBookNotes } from "@/services/book-note-service";
import { useReaderStoreApi } from "@/pages/reader/components/reader-provider";
import {
  generateCommentReview,
  generateThreadReply,
  postBookReview,
  postThreadReply,
} from "@/services/comment-review-service";
import type { BookNote } from "@/types/book";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";

interface UseAnnotationsProps {
  bookId?: string;
}

export const useAnnotations = ({ bookId }: UseAnnotationsProps = {}) => {
  const queryClient = useQueryClient();
  const readerStore = useReaderStoreApi();

  // 获取当前书籍的所有标注
  const {
    data: annotations,
    error,
    isLoading,
    status,
  } = useQuery({
    queryKey: ["annotations", bookId],
    queryFn: async () => {
      if (!bookId) return [];
      const bookNotes = await getBookNotes(bookId);
      // 阅读位置正序：前页/前段在上；生成时间只用于位置不可区分时的稳定兜底。
      // 书评区的帖子与楼层（review 类型）也在这里一起取出。
      return sortAnnotationsByReadingOrder(
        bookNotes.filter((note) => (note.type === "annotation" || note.type === REVIEW_NOTE_TYPE) && !note.deletedAt),
      );
    },
    enabled: !!bookId,
  });

  const handleGenerateAiReview = useCallback(
    async (source: BookNote): Promise<BookNote> => {
      if (!bookId) throw new Error("当前书籍尚未就绪");
      const { saved, existed, mode } = await generateCommentReview({
        bookId,
        source,
        readerStore,
        queryClient,
      });
      const modeText = mode ? `（${REVIEW_MODE_LABEL[mode]}）` : "";
      toast.success(existed ? `Nova 重新回评了${modeText}` : `Nova 回评了${modeText}`);
      return saved;
    },
    [bookId, queryClient, readerStore],
  );

  const handlePostBookReview = useCallback(
    async (text: string): Promise<BookNote> => {
      if (!bookId) throw new Error("当前书籍尚未就绪");
      return postBookReview({ bookId, text, readerStore, queryClient });
    },
    [bookId, queryClient, readerStore],
  );

  const handlePostReply = useCallback(
    async (top: BookNote, text: string): Promise<BookNote> => {
      if (!bookId) throw new Error("当前书籍尚未就绪");
      return postThreadReply({ bookId, top, text, readerStore, queryClient });
    },
    [bookId, queryClient, readerStore],
  );

  const handleNovaThreadReply = useCallback(
    async (thread: Pick<AnnotationThread, "top" | "replies">): Promise<BookNote> => {
      if (!bookId) throw new Error("当前书籍尚未就绪");
      return generateThreadReply({ bookId, thread, readerStore, queryClient });
    },
    [bookId, queryClient, readerStore],
  );

  // 删除标注
  const handleDeleteAnnotation = useCallback(
    async (annotationId: string) => {
      try {
        const readerState = readerStore.getState();
        const readerIsCurrentBook = readerState.bookId === bookId;
        const currentNotes = readerIsCurrentBook
          ? (readerState.config?.booknotes ?? (bookId ? await getBookNotes(bookId) : []))
          : [];
        const removed = currentNotes.filter((note) => note.id === annotationId || note.sourceNoteId === annotationId);
        await deleteBookNote(annotationId);
        if (readerIsCurrentBook) {
          const view = readerStore.getState().view;
          const nextNotes = currentNotes.filter(
            (note) => note.id !== annotationId && note.sourceNoteId !== annotationId,
          );
          // 书页上的标注按 cfi 区分：只擦掉真正画过的（annotation），再把同一位置剩下的重画回来
          const drawnRemoved = removed.filter((note) => note.type === "annotation");
          for (const note of drawnRemoved) view?.addAnnotation(note, true);
          const erasedCfis = new Set(drawnRemoved.map((note) => note.cfi));
          for (const note of nextNotes) {
            if (note.type === "annotation" && !note.deletedAt && erasedCfis.has(note.cfi)) view?.addAnnotation(note);
          }
          const updatedConfig = readerStore.getState().updateBooknotes(nextNotes);
          if (updatedConfig) await readerStore.getState().saveConfig(updatedConfig);
        }
        toast.success("已删除");

        // 刷新标注列表
        await queryClient.invalidateQueries({
          queryKey: ["annotations", bookId],
        });
      } catch (error) {
        console.error("删除标注失败:", error);
        toast.error("删除标注失败");
        throw error;
      }
    },
    [bookId, queryClient, readerStore],
  );

  return {
    annotations: annotations ?? [],
    error,
    isLoading,
    status,
    handleDeleteAnnotation,
    handleGenerateAiReview,
    handlePostBookReview,
    handlePostReply,
    handleNovaThreadReply,
  };
};

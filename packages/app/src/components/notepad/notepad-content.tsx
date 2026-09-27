import { DigestView } from "@/pages/notes/digest-view";
import { useReaderStore } from "@/pages/reader/components/reader-provider";
import { useLayoutStore } from "@/store/layout-store";
import { useReaderStore as useAppReaderStore } from "@/store/reader-store";
import {
  type NotepadOrder,
  buildAnnotationThreads,
  loadNotepadOrder,
  loadReviewModes,
  saveNotepadOrder,
} from "@/lib/comment-review";
import { useEffect, useMemo, useState } from "react";
import { AnnotationItem } from "./annotation-item";
import { useAnnotations } from "./hooks";
import { NotepadHeader } from "./notepad-header";

interface NotepadContentProps {
  bookId: string;
  showDigest: boolean;
  onOpenDigest: () => void;
  onCloseDigest: () => void;
}

export const NotepadContent = ({ bookId, showDigest, onOpenDigest, onCloseDigest }: NotepadContentProps) => {
  const {
    annotations,
    status: annotationStatus,
    handleDeleteAnnotation,
    handleGenerateAiReview,
  } = useAnnotations({ bookId });
  const { activeBook } = useAppReaderStore();
  const progress = useReaderStore((state) => state.progress);
  const pendingAnnotationId = useLayoutStore((state) => state.pendingNotepadAnnotationId);
  const clearPendingAnnotation = useLayoutStore((state) => state.clearPendingNotepadAnnotation);
  // 线程：我的划线/评论在上，Nova 的回评挂在下面；默认最新在上
  const [order, setOrder] = useState<NotepadOrder>(() => loadNotepadOrder());
  const threads = useMemo(() => buildAnnotationThreads(annotations ?? [], order), [annotations, order]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 标注列表刷新时重新读取回评方式
  const reviewModes = useMemo(() => loadReviewModes(), [annotations]);

  useEffect(() => {
    if (!pendingAnnotationId || annotationStatus !== "success") return;
    const element = document.querySelector<HTMLElement>(`[data-annotation-id="${CSS.escape(pendingAnnotationId)}"]`);
    if (element) {
      element.scrollIntoView({ block: "center", behavior: "smooth" });
      element.focus({ preventScroll: true });
    }
    clearPendingAnnotation();
  }, [annotationStatus, clearPendingAnnotation, pendingAnnotationId]);

  // DigestView 作为整页覆盖
  if (showDigest) {
    return (
      <DigestView
        bookId={bookId}
        bookTitle={progress?.sectionLabel ?? activeBook?.title ?? "本书"}
        bookAuthor={activeBook?.author ?? ""}
        onClose={onCloseDigest}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <NotepadHeader annotationCount={annotations.length} onOpenDigest={onOpenDigest} />
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-2 p-1">
          {annotationStatus === "pending" ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-700 dark:border-border dark:border-t-neutral-400" />
            </div>
          ) : annotationStatus === "error" ? (
            <div className="flex items-center justify-center py-8 text-neutral-500 text-sm">
              <p>加载失败</p>
            </div>
          ) : annotations.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-neutral-500 text-sm">
              <p>选中文本并高亮来创建第一条记录</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-end gap-1 px-1 text-[11px]">
                {(["newest", "position"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      setOrder(option);
                      saveNotepadOrder(option);
                    }}
                    className={`rounded-full px-2 py-0.5 transition-colors ${
                      order === option ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {option === "newest" ? "最新在上" : "按原文位置"}
                  </button>
                ))}
              </div>
              {threads.map(({ top, replies }) => (
                <div key={top.id} className="dr-rise-in space-y-1">
                  <AnnotationItem
                    annotation={top}
                    selected={pendingAnnotationId === top.id}
                    onDelete={handleDeleteAnnotation}
                    onGenerateAiReview={handleGenerateAiReview}
                    hasAiReview={replies.length > 0}
                    reviewMode={reviewModes[top.id]}
                  />
                  {replies.map((reply) => (
                    <AnnotationItem
                      key={reply.id}
                      annotation={reply}
                      reply
                      reviewMode={reviewModes[reply.id]}
                      selected={pendingAnnotationId === reply.id}
                      onDelete={handleDeleteAnnotation}
                    />
                  ))}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

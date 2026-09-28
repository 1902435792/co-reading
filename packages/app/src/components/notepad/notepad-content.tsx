import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  type NotepadOrder,
  buildAnnotationThreads,
  isBookReviewPost,
  loadNotepadOrder,
  loadReviewModes,
  saveNotepadOrder,
} from "@/lib/comment-review";
import { DigestView } from "@/pages/notes/digest-view";
import { useReaderStore } from "@/pages/reader/components/reader-provider";
import { useLayoutStore } from "@/store/layout-store";
import { useReaderStore as useAppReaderStore } from "@/store/reader-store";
import { PenLine, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAnnotations } from "./hooks";
import { NotepadHeader } from "./notepad-header";
import { ReviewThread } from "./review-thread";

interface NotepadContentProps {
  bookId: string;
  showDigest: boolean;
  onOpenDigest: () => void;
  onCloseDigest: () => void;
}

type ThreadFilter = "all" | "passage" | "book";
const FILTER_LABEL: Record<ThreadFilter, string> = { all: "全部", passage: "划线", book: "书评" };

export const NotepadContent = ({ bookId, showDigest, onOpenDigest, onCloseDigest }: NotepadContentProps) => {
  const {
    annotations,
    status: annotationStatus,
    handleDeleteAnnotation,
    handleGenerateAiReview,
    handlePostBookReview,
    handlePostReply,
    handleNovaThreadReply,
  } = useAnnotations({ bookId });
  const { activeBook } = useAppReaderStore();
  const progress = useReaderStore((state) => state.progress);
  const pendingAnnotationId = useLayoutStore((state) => state.pendingNotepadAnnotationId);
  const clearPendingAnnotation = useLayoutStore((state) => state.clearPendingNotepadAnnotation);
  // 书评区：每条划线 / Nova 共读边注 / 整书书评是一个帖子，回复按楼层挂在下面；默认最新在上
  const [order, setOrder] = useState<NotepadOrder>(() => loadNotepadOrder());
  const [filter, setFilter] = useState<ThreadFilter>("all");
  const allThreads = useMemo(() => buildAnnotationThreads(annotations ?? [], order), [annotations, order]);
  const threads = useMemo(
    () =>
      filter === "all"
        ? allThreads
        : allThreads.filter((thread) => (filter === "book") === isBookReviewPost(thread.top)),
    [allThreads, filter],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: 标注列表刷新时重新读取回评方式
  const reviewModes = useMemo(() => loadReviewModes(), [annotations]);
  const passageCount = useMemo(() => annotations.filter((note) => note.type === "annotation").length, [annotations]);

  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    if (!pendingAnnotationId || annotationStatus !== "success") return;
    // 要定位的楼层可能被筛选掉了：切回全部
    setFilter("all");
    const timer = window.setTimeout(() => {
      const element = document.querySelector<HTMLElement>(`[data-annotation-id="${CSS.escape(pendingAnnotationId)}"]`);
      if (element) {
        element.scrollIntoView({ block: "center", behavior: "smooth" });
        element.focus({ preventScroll: true });
      }
      clearPendingAnnotation();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [annotationStatus, clearPendingAnnotation, pendingAnnotationId]);

  const publish = async (thenAskNova: boolean) => {
    const text = draft.trim();
    if (!text || posting) return;
    setPosting(true);
    try {
      const saved = await handlePostBookReview(text);
      setDraft("");
      setComposing(false);
      setFilter((current) => (current === "passage" ? "all" : current));
      if (thenAskNova) {
        try {
          await handleNovaThreadReply({ top: saved, replies: [] });
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Nova 暂时回不了，稍后再试");
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "发布失败");
    } finally {
      setPosting(false);
    }
  };

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
      <NotepadHeader annotationCount={passageCount} threadCount={allThreads.length} onOpenDigest={onOpenDigest} />

      {/* 书评区工具条：写书评 / 筛选 / 排序 */}
      <div className="flex flex-wrap items-center gap-1 border-border border-b px-2 py-1.5 text-[11px]">
        <Button
          variant={composing ? "secondary" : "outline"}
          size="sm"
          className="h-7 gap-1 rounded-full px-2.5 text-xs"
          onClick={() => setComposing((value) => !value)}
        >
          <PenLine className="size-3.5" />
          写书评
        </Button>
        <div className="ml-auto flex items-center gap-0.5">
          {(["all", "passage", "book"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setFilter(option)}
              className={`rounded-full px-2 py-0.5 transition-colors ${
                filter === option ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent"
              }`}
            >
              {FILTER_LABEL[option]}
            </button>
          ))}
          <span className="mx-0.5 text-border">|</span>
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
              {option === "newest" ? "最新" : "原文顺序"}
            </button>
          ))}
        </div>
      </div>

      {composing && (
        <div className="space-y-1.5 border-border border-b bg-muted/30 px-2 py-2">
          <Textarea
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                void publish(false);
              } else if (event.key === "Escape") {
                setComposing(false);
              }
            }}
            placeholder={`聊聊《${activeBook?.title ?? "这本书"}》：整体感受、人物、写法……（不针对具体句子）`}
            className="min-h-[84px] resize-none bg-background text-[13px]"
            disabled={posting}
          />
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setComposing(false)}
              disabled={posting}
            >
              取消
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => void publish(false)}
              disabled={posting || !draft.trim()}
            >
              发布
            </Button>
            <Button
              size="sm"
              className="h-8 gap-1 text-xs"
              onClick={() => void publish(true)}
              disabled={posting || !draft.trim()}
            >
              <Sparkles className="size-3.5" />
              发布并请 Nova 回复
            </Button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <div className="space-y-2.5 p-2">
          {annotationStatus === "pending" ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-700 dark:border-border dark:border-t-neutral-400" />
            </div>
          ) : annotationStatus === "error" ? (
            <div className="flex items-center justify-center py-8 text-neutral-500 text-sm">
              <p>加载失败</p>
            </div>
          ) : threads.length === 0 ? (
            <div className="px-4 py-10 text-center text-neutral-500 text-sm leading-relaxed">
              {filter === "book" ? (
                <p>还没有整书书评。点上面的「写书评」聊聊这本书。</p>
              ) : filter === "passage" ? (
                <p>还没有划线。选中文字就能划线、写评论。</p>
              ) : (
                <p>
                  书评区还是空的。
                  <br />
                  选中文字划线、写评论，或点「写书评」聊聊整本书。
                </p>
              )}
            </div>
          ) : (
            threads.map((thread) => (
              <ReviewThread
                key={thread.top.id}
                thread={thread}
                selectedId={pendingAnnotationId}
                reviewModes={reviewModes}
                onDelete={handleDeleteAnnotation}
                onGenerateAiReview={handleGenerateAiReview}
                onPostReply={handlePostReply}
                onNovaReply={handleNovaThreadReply}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
};

import { isJevPickNote } from "@/lib/co-reading-trigger";
import { buildAnnotationThreads, loadReviewModes } from "@/lib/comment-review";
import { useLayoutStore } from "@/store/layout-store";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAnnotations } from "./hooks";
import { ReviewThread } from "./review-thread";

/** 抽屉动画：和系统底部面板一样先快后慢 */
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
const DURATION = 320;
/** 往下拉超过面板高度的这个比例、或者甩得够快，就收起 */
const CLOSE_RATIO = 0.25;
const CLOSE_VELOCITY = 0.55; // px/ms

/**
 * 手机：点书上的一条批注，从底部滑上来一张卡片，只显示这一条（原文 + 评论 + 楼层回复）。
 * 手指按住往下拉可以把它拉下去；点卡片外面、按返回键也会收起。
 */
export function FocusedThreadSheet({ bookId, active }: { bookId: string; active: boolean }) {
  const focused = useLayoutStore((s) => s.focusedAnnotation);
  const closeFocused = useLayoutStore((s) => s.closeFocusedAnnotation);
  const targetId = active && focused?.bookId === bookId ? focused.id : null;

  const { annotations, status, handleDeleteAnnotation, handleGenerateAiReview, handlePostReply, handleNovaThreadReply } =
    useAnnotations({ bookId });

  // 收起动画期间内容还要留着，所以单独记一份「正在显示的」
  const [shownId, setShownId] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (targetId) {
      setShownId(targetId);
      setDrag(0);
      // 先以「藏在下面」的状态画一帧，再滑上来
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setVisible(true));
      });
      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      };
    }
    setVisible(false);
    const timer = window.setTimeout(() => {
      setShownId(null);
      setDrag(0);
    }, DURATION + 20);
    return () => window.clearTimeout(timer);
  }, [targetId]);

  // 刚点开的那一帧 shownId 还没更新，所以优先按 targetId 找
  const lookupId = targetId ?? shownId;
  const thread = useMemo(() => {
    if (!lookupId) return null;
    const visibleNotes = (annotations ?? []).filter((note) => !isJevPickNote(note));
    const found = buildAnnotationThreads(visibleNotes, "position").find(
      (item) => item.top.id === lookupId || item.replies.some((reply) => reply.id === lookupId),
    );
    if (found) return found;
    // 兜底：列表里有这条但没归进帖子，就单独显示它
    const single = (annotations ?? []).find((note) => note.id === lookupId);
    return single ? { top: single, replies: [], latest: single.updatedAt ?? single.createdAt } : null;
  }, [annotations, lookupId]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 标注列表刷新时重新读取回评方式
  const reviewModes = useMemo(() => loadReviewModes(), [annotations]);

  // 切到别的标签页 / 回书架：收起
  useEffect(() => {
    if (!active && focused?.bookId === bookId) closeFocused();
  }, [active, focused, bookId, closeFocused]);

  // 这条批注被删掉了（比如在卡片里点了删除）：卡片跟着收起
  useEffect(() => {
    if (targetId && status === "success" && !thread) closeFocused();
  }, [targetId, status, thread, closeFocused]);

  // 手指拖动：按在顶部把手上随时能拖；按在内容上时，内容已经滚到顶再往下拉才拖面板
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel || !shownId) return;
    let startY = 0;
    let lastY = 0;
    let lastT = 0;
    let velocity = 0;
    let tracking = false;
    let active = false;
    let fromHandle = false;

    const onStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      startY = lastY = touch.clientY;
      lastT = performance.now();
      velocity = 0;
      tracking = true;
      active = false;
      fromHandle = Boolean((event.target as HTMLElement | null)?.closest?.("[data-sheet-handle]"));
    };
    const onMove = (event: TouchEvent) => {
      if (!tracking) return;
      const touch = event.touches[0];
      const dy = touch.clientY - startY;
      const now = performance.now();
      if (!active) {
        const atTop = (scrollRef.current?.scrollTop ?? 0) <= 0;
        if (dy > 6 && (fromHandle || atTop)) {
          active = true;
          setDragging(true);
        } else if (Math.abs(dy) > 6) {
          tracking = false; // 这是在滚动内容
          return;
        } else {
          return;
        }
      }
      if (event.cancelable) event.preventDefault();
      const dt = Math.max(1, now - lastT);
      velocity = (touch.clientY - lastY) / dt;
      lastY = touch.clientY;
      lastT = now;
      // 往上拉一点点有阻尼，往下跟手
      setDrag(dy >= 0 ? dy : dy * 0.2);
    };
    const onEnd = () => {
      if (!tracking) return;
      tracking = false;
      if (!active) return;
      active = false;
      setDragging(false);
      const height = panel.getBoundingClientRect().height || 1;
      const offset = lastY - startY;
      if (offset > height * CLOSE_RATIO || velocity > CLOSE_VELOCITY) {
        closeFocused();
      } else {
        setDrag(0);
      }
    };
    panel.addEventListener("touchstart", onStart, { passive: true });
    panel.addEventListener("touchmove", onMove, { passive: false });
    panel.addEventListener("touchend", onEnd);
    panel.addEventListener("touchcancel", onEnd);
    return () => {
      panel.removeEventListener("touchstart", onStart);
      panel.removeEventListener("touchmove", onMove);
      panel.removeEventListener("touchend", onEnd);
      panel.removeEventListener("touchcancel", onEnd);
    };
  }, [shownId, closeFocused]);

  if (!shownId) return null;

  const panelHeight = panelRef.current?.getBoundingClientRect().height || 400;
  const scrimOpacity = visible ? Math.max(0, 1 - drag / panelHeight) : 0;
  const transition = dragging ? "none" : `transform ${DURATION}ms ${EASE}`;

  return (
    <div className="absolute inset-0 z-40" data-focused-thread-sheet="">
      {/* 点卡片外面收起；淡淡一层，不压暗书页 */}
      <div
        className="absolute inset-0 bg-black/10"
        style={{ opacity: scrimOpacity, transition: dragging ? "none" : `opacity ${DURATION}ms ${EASE}` }}
        onClick={closeFocused}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-label="批注"
        className="absolute inset-x-0 bottom-0 flex max-h-[78%] flex-col rounded-t-2xl border-t bg-background shadow-[0_-8px_30px_rgba(0,0,0,0.12)]"
        style={{
          transform: visible ? `translateY(${drag}px)` : "translateY(100%)",
          transition,
          willChange: "transform",
        }}
      >
        <div data-sheet-handle="" className="flex h-6 shrink-0 cursor-grab items-center justify-center" style={{ touchAction: "none" }}>
          <div className="h-1 w-10 rounded-full bg-neutral-300 dark:bg-neutral-600" />
        </div>
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4">
          {thread ? (
            <ReviewThread
              thread={thread}
              selectedId={lookupId ?? undefined}
              reviewModes={reviewModes}
              onDelete={handleDeleteAnnotation}
              onGenerateAiReview={handleGenerateAiReview}
              onPostReply={handlePostReply}
              onNovaReply={handleNovaThreadReply}
            />
          ) : (
            <div className="py-8 text-center text-neutral-500 text-sm">加载中…</div>
          )}
        </div>
      </div>
    </div>
  );
}

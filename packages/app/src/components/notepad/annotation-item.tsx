import { isPhoneWidth } from "@/lib/phone-reader";
import { useLayoutStore } from "@/store/layout-store";
import { NOVA_STATIC_AVATAR } from "@/components/nova/nova-assets";
import { type CommentReviewMode, REVIEW_MODE_LABEL } from "@/lib/comment-review";
import { useReaderStore } from "@/pages/reader/components/reader-provider";
import { HIGHLIGHT_COLOR_HEX, HIGHLIGHT_COLOR_RGBA } from "@/services/constants";

import type { BookNote } from "@/types/book";
import { Menu } from "@tauri-apps/api/menu";
import { LogicalPosition } from "@tauri-apps/api/window";
import { ask } from "@tauri-apps/plugin-dialog";
import dayjs from "dayjs";
import { Bot, X } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

interface AnnotationItemProps {
  annotation: BookNote;
  selected?: boolean;
  onDelete?: (id: string) => void;
  onGenerateAiReview?: (annotation: BookNote) => Promise<BookNote>;
  hasAiReview?: boolean;
  /** 作为 Nova 回评挂在原划线下面显示（不重复原文）。 */
  reply?: boolean;
  reviewMode?: CommentReviewMode;
}

export const AnnotationItem = ({
  annotation,
  selected = false,
  onDelete,
  onGenerateAiReview,
  hasAiReview = false,
  reply = false,
  reviewMode,
}: AnnotationItemProps) => {
  const view = useReaderStore((state) => state.view);

  const bgColor = annotation.color ? HIGHLIGHT_COLOR_RGBA[annotation.color] : HIGHLIGHT_COLOR_RGBA.yellow;
  const lineColor = annotation.color ? HIGHLIGHT_COLOR_HEX[annotation.color] : HIGHLIGHT_COLOR_HEX.yellow;
  const style = annotation.style || "highlight";
  const isAiAnnotation = annotation.author === "ai";
  const canGenerateAiReview = !isAiAnnotation && Boolean(annotation.text?.trim());
  const [generatingAiReview, setGeneratingAiReview] = useState(false);
  const aiReviewActionLabel = generatingAiReview ? "Nova 回评中…" : hasAiReview ? "让 Nova 重新回评" : "让 Nova 回评";
  const handleGenerateReview = useCallback(async () => {
    if (!canGenerateAiReview || !onGenerateAiReview || generatingAiReview) return;
    setGeneratingAiReview(true);
    try {
      await onGenerateAiReview(annotation);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "AI 书评生成失败");
    } finally {
      setGeneratingAiReview(false);
    }
  }, [annotation, canGenerateAiReview, generatingAiReview, onGenerateAiReview]);

  const handleClick = useCallback(() => {
    // 原文定位始终保留
    if (view) {
      view.goTo(annotation.cfi);
      // 手机上笔记面板盖住整本书：跳完收起来
      if (isPhoneWidth() && useLayoutStore.getState().isNotepadVisible) {
        useLayoutStore.setState({ isNotepadVisible: false });
      }
    }
    // 不再联动打开右侧栏。
  }, [annotation, view]);
  const handleNativeDelete = useCallback(async () => {
    try {
      const confirmed = await ask(`确定要删除这条标注吗？\n\n"${annotation.text || ""}"\n\n此操作无法撤销。`, {
        title: "确认删除",
        kind: "warning",
      });

      if (confirmed && onDelete) {
        await onDelete(annotation.id);
      }
    } catch (error) {
      console.error("删除标注失败:", error);
    }
  }, [annotation, onDelete]);

  const handleMenuClick = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      try {
        const menu = await Menu.new({
          items: [
            ...(canGenerateAiReview
              ? [
                  {
                    id: "ai-review",
                    text: aiReviewActionLabel,
                    enabled: !generatingAiReview,
                    action: () => void handleGenerateReview(),
                  },
                ]
              : []),
            {
              id: "delete",
              text: "删除",
              action: () => {
                handleNativeDelete();
              },
            },
          ],
        });

        await menu.popup(new LogicalPosition(e.clientX, e.clientY));
      } catch (error) {
        console.error("显示菜单失败:", error);
      }
    },
    [aiReviewActionLabel, canGenerateAiReview, generatingAiReview, handleGenerateReview, handleNativeDelete],
  );

  return (
    <div
      data-annotation-id={annotation.id}
      aria-current={selected ? "true" : undefined}
      className={`group relative cursor-pointer rounded-lg p-2 transition-colors ${
        selected
          ? "bg-primary/10 ring-2 ring-primary ring-offset-1"
          : reply
            ? "ml-4 rounded-l-none border-primary/40 border-l-2 bg-primary/5 hover:bg-primary/10"
            : isAiAnnotation
              ? "border-primary/30 border-l-2 bg-muted/40 hover:bg-muted/70"
              : "border bg-card shadow-xs hover:shadow-sm"
      }`}
      role="button"
      tabIndex={0}
      aria-label={`跳转到标注原文：${annotation.text ?? ""}`}
      onClick={handleClick}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          handleClick();
        }
      }}
      onContextMenu={handleMenuClick}
    >
      {/* hover 删除按钮 */}
      <button
        type="button"
        className="absolute top-1.5 right-1.5 hidden rounded-full p-0.5 text-neutral-400 transition-colors hover:bg-neutral-300 hover:text-neutral-700 group-hover:block dark:hover:bg-accent dark:hover:text-neutral-200"
        onClick={(e) => {
          e.stopPropagation();
          handleNativeDelete();
        }}
        title="删除"
      >
        <X className="size-3.5" />
      </button>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {isAiAnnotation && (
            <div className="mb-1.5 flex items-center gap-1.5 text-primary text-xs">
              <img src={NOVA_STATIC_AVATAR} alt="" className="size-4 rounded-full" />
              <span className="font-medium">{annotation.sourceNoteId ? "Nova 回评" : "Nova 共读"}</span>
              {reviewMode && (
                <span className="rounded-full bg-primary/10 px-1.5 py-px text-[10px]">
                  {REVIEW_MODE_LABEL[reviewMode]}
                </span>
              )}
            </div>
          )}
          {!reply && annotation.context && (
            <div className="mb-1 text-sm leading-relaxed">
              <span className="text-neutral-600 dark:text-neutral-200">...{annotation.context.before}</span>
              <span
                className="font-medium text-sm"
                style={{
                  backgroundColor: style === "highlight" ? bgColor : "transparent",
                  textDecoration: style === "underline" || style === "squiggly" ? "underline" : "none",
                  textDecorationColor: style !== "highlight" ? lineColor : undefined,
                  textDecorationThickness: "2px",
                  textDecorationStyle: style === "squiggly" ? "wavy" : "solid",
                }}
              >
                {annotation.text}
              </span>
              <span className="text-neutral-600 dark:text-neutral-200">{annotation.context.after}...</span>
            </div>
          )}

          {!reply && !annotation.context && (
            <div className="mb-2">
              <span
                className="font-medium text-sm"
                style={{
                  backgroundColor: style === "highlight" ? bgColor : "transparent",
                  textDecoration: style === "underline" || style === "squiggly" ? "underline" : "none",
                  textDecorationColor: style !== "highlight" ? lineColor : undefined,
                  textDecorationThickness: "2px",
                  textDecorationStyle: style === "squiggly" ? "wavy" : "solid",
                }}
              >
                {annotation.text}
              </span>
            </div>
          )}

          {/* 用户的想法 */}
          {annotation.note && (
            <div
              className={`mt-1.5 flex items-start gap-1.5 rounded-md px-2 py-1.5 text-xs ${
                reply
                  ? "px-0 py-0 text-[13px] text-foreground leading-relaxed"
                  : isAiAnnotation
                    ? "bg-primary/10 text-foreground"
                    : "bg-amber-100/60 text-foreground dark:bg-amber-400/10"
              }`}
            >
              {!isAiAnnotation && (
                <span className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-px font-medium text-[10px] text-amber-700 dark:text-amber-300">
                  我
                </span>
              )}
              <span className="whitespace-pre-wrap">{annotation.note}</span>
            </div>
          )}

          <div className="mt-2 flex items-center gap-2 text-muted-foreground text-xs dark:text-neutral-500">
            <span>{dayjs(annotation.createdAt).format("MM-DD HH:mm")}</span>
            {canGenerateAiReview ? (
              <button
                type="button"
                className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={generatingAiReview}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  void handleGenerateReview();
                }}
              >
                <Bot className="size-3.5" />
                <span>{aiReviewActionLabel}</span>
              </button>
            ) : (
              isAiAnnotation && (
                <span className="ml-auto text-primary/80">
                  {annotation.sourceNoteId ? "点击定位原文" : "点击定位原文与阅读地图"}
                </span>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

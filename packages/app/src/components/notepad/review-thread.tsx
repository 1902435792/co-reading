import { NOVA_STATIC_AVATAR } from "@/components/nova/nova-assets";
import { openReadingFootprintForAnnotation } from "@/components/side-chat/co-reading-backlink";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import {
  type AnnotationThread,
  type CommentReviewMode,
  REVIEW_MODE_LABEL,
  isBookReviewPost,
} from "@/lib/comment-review";
import { useReaderStore } from "@/pages/reader/components/reader-provider";
import { HIGHLIGHT_COLOR_HEX } from "@/services/constants";
import { useLayoutStore } from "@/store/layout-store";
import type { BookNote } from "@/types/book";
import { ask } from "@tauri-apps/plugin-dialog";
import dayjs from "dayjs";
import {
  BookOpen,
  Copy,
  Loader2,
  MapPin,
  MessageSquare,
  MoreHorizontal,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

/** 楼层超过这个数时，默认只显示最后几楼，前面的折叠起来。 */
const COLLAPSE_AFTER = 4;
const SHOW_WHEN_COLLAPSED = 3;

type ThreadKind = "passage" | "nova" | "book";

export interface ReviewThreadProps {
  thread: AnnotationThread;
  selectedId?: string | null;
  reviewModes: Record<string, CommentReviewMode>;
  onDelete: (id: string) => Promise<void>;
  onGenerateAiReview: (source: BookNote) => Promise<BookNote>;
  onPostReply: (top: BookNote, text: string) => Promise<BookNote>;
  onNovaReply: (thread: Pick<AnnotationThread, "top" | "replies">) => Promise<BookNote>;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 安卓 WebView 下 clipboard API 可能不可用，退回 execCommand
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

async function confirmDelete(message: string): Promise<boolean> {
  try {
    return await ask(message, { title: "确认删除", kind: "warning" });
  } catch {
    return window.confirm(message);
  }
}

const threadKind = (top: BookNote): ThreadKind =>
  isBookReviewPost(top) ? "book" : top.author === "ai" ? "nova" : "passage";

export const ReviewThread = ({
  thread,
  selectedId,
  reviewModes,
  onDelete,
  onGenerateAiReview,
  onPostReply,
  onNovaReply,
}: ReviewThreadProps) => {
  const { top, replies } = thread;
  const kind = threadKind(top);
  const view = useReaderStore((state) => state.view);
  const bookId = useReaderStore((state) => state.bookId);
  const setPendingReadingFootprint = useReaderStore((state) => state.setPendingReadingFootprint);

  const [expanded, setExpanded] = useState(false);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [novaBusy, setNovaBusy] = useState(false);

  const firstReview = replies.find((reply) => reply.type === "annotation" && reply.author === "ai");
  // 还没有 Nova 回评的划线：沿用原来的「回评」（会在书页上画出 Nova 的边注）
  const useFirstReview = kind === "passage" && Boolean(top.text?.trim()) && !firstReview;
  const lastFloor = replies.length > 0 ? replies[replies.length - 1]! : top;
  const novaLabel = novaBusy
    ? "Nova 正在输入…"
    : useFirstReview
      ? "让 Nova 回评"
      : lastFloor.author === "ai"
        ? "让 Nova 再说说"
        : "请 Nova 回复";

  const collapsed = !expanded && replies.length > COLLAPSE_AFTER;
  const visibleReplies = collapsed ? replies.slice(-SHOW_WHEN_COLLAPSED) : replies;
  const hiddenCount = replies.length - visibleReplies.length;

  const jumpToPassage = useCallback(() => {
    if (kind === "book") return;
    if (view && top.cfi) view.goTo(top.cfi);
    const opened = openReadingFootprintForAnnotation({
      bookId: bookId ?? undefined,
      annotation: top,
      setPendingReadingFootprint: setPendingReadingFootprint ?? undefined,
      eventTarget: typeof window !== "undefined" ? window : undefined,
    });
    if (opened) useLayoutStore.setState({ isChatVisible: true });
  }, [bookId, kind, setPendingReadingFootprint, top, view]);

  const askNova = useCallback(
    async (base: Pick<AnnotationThread, "top" | "replies"> = thread) => {
      if (novaBusy) return;
      setNovaBusy(true);
      try {
        if (useFirstReview && base.replies.length === 0) await onGenerateAiReview(base.top);
        else await onNovaReply(base);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Nova 暂时回不了，稍后再试");
      } finally {
        setNovaBusy(false);
      }
    },
    [novaBusy, onGenerateAiReview, onNovaReply, thread, useFirstReview],
  );

  const regenerateFirstReview = useCallback(async () => {
    if (novaBusy) return;
    setNovaBusy(true);
    try {
      await onGenerateAiReview(top);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nova 暂时回不了，稍后再试");
    } finally {
      setNovaBusy(false);
    }
  }, [novaBusy, onGenerateAiReview, top]);

  const send = useCallback(
    async (thenAskNova: boolean) => {
      const text = draft.trim();
      if (!text || sending) return;
      setSending(true);
      try {
        const saved = await onPostReply(top, text);
        setDraft("");
        setComposing(false);
        if (thenAskNova) await askNova({ top, replies: [...replies, saved] });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "回复失败");
      } finally {
        setSending(false);
      }
    },
    [askNova, draft, onPostReply, replies, sending, top],
  );

  const deleteFloor = useCallback(
    async (note: BookNote) => {
      const isTop = note.id === top.id;
      const message = isTop
        ? replies.length > 0
          ? `删除整个帖子？连同下面 ${replies.length} 楼回复一起删除，书页上的划线也会去掉。\n\n此操作无法撤销。`
          : kind === "book"
            ? "删除这条书评？\n\n此操作无法撤销。"
            : "删除这条划线？\n\n此操作无法撤销。"
        : "删除这一楼？\n\n此操作无法撤销。";
      if (!(await confirmDelete(message))) return;
      try {
        await onDelete(note.id);
      } catch {
        // onDelete 已经提示过
      }
    },
    [kind, onDelete, replies.length, top.id],
  );

  const color = HIGHLIGHT_COLOR_HEX[top.color ?? "yellow"] ?? HIGHLIGHT_COLOR_HEX.yellow;
  const kindLabel =
    kind === "book" ? "整书书评" : kind === "nova" ? "Nova 共读" : top.note?.trim() ? "划线评论" : "划线";

  return (
    <article className="dr-rise-in overflow-hidden rounded-xl border bg-card shadow-xs">
      {/* 帖子头：引用原文 / 整书书评标记 */}
      <div className="flex items-center gap-1.5 px-3 pt-2.5 text-[11px] text-muted-foreground">
        {kind === "book" ? <BookOpen className="size-3.5" /> : <MessageSquare className="size-3.5" />}
        <span>{kindLabel}</span>
        <span className="ml-auto">{replies.length > 0 ? `${replies.length + 1} 楼` : ""}</span>
      </div>
      {kind !== "book" && top.text?.trim() && (
        <button
          type="button"
          onClick={jumpToPassage}
          className="mx-3 mt-1.5 block w-[calc(100%-1.5rem)] rounded-md border-l-[3px] bg-muted/40 px-2.5 py-1.5 text-left text-[13px] leading-relaxed transition-colors hover:bg-muted/70"
          style={{ borderLeftColor: color }}
          title="定位到原文"
        >
          <span className="line-clamp-4">
            {top.context?.before && <span className="text-muted-foreground">…{top.context.before.slice(-24)}</span>}
            <span className="font-medium text-foreground">{top.text}</span>
            {top.context?.after && <span className="text-muted-foreground">{top.context.after.slice(0, 24)}…</span>}
          </span>
        </button>
      )}

      {/* 楼层 */}
      <div className="mt-1.5 divide-y divide-border/60">
        <Floor
          note={top}
          floor={1}
          kind={kind}
          isTop
          selected={selectedId === top.id}
          mode={reviewModes[top.id]}
          onCopy={() => copyText(top.note?.trim() || top.text || "")}
          onJump={kind === "book" ? undefined : jumpToPassage}
          onRegenerate={firstReview ? regenerateFirstReview : undefined}
          onDelete={() => deleteFloor(top)}
        />
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="w-full py-1.5 text-center text-[12px] text-primary hover:bg-accent"
          >
            展开前面 {hiddenCount} 楼
          </button>
        )}
        {visibleReplies.map((reply) => (
          <Floor
            key={reply.id}
            note={reply}
            floor={replies.indexOf(reply) + 2}
            kind={kind}
            selected={selectedId === reply.id}
            mode={reviewModes[reply.id]}
            onCopy={() => copyText(reply.note ?? "")}
            onDelete={() => deleteFloor(reply)}
          />
        ))}
        {novaBusy && (
          <div className="flex items-center gap-2 px-3 py-2 text-[12px] text-muted-foreground">
            <img src={NOVA_STATIC_AVATAR} alt="" className="size-5 rounded-full" />
            <Loader2 className="size-3.5 animate-spin" />
            Nova 正在输入…
          </div>
        )}
      </div>

      {/* 回复框 */}
      {composing && (
        <div className="space-y-1.5 border-t px-3 py-2">
          <Textarea
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                void send(false);
              } else if (event.key === "Escape") {
                setComposing(false);
              }
            }}
            placeholder={kind === "book" ? "接着聊聊这本书…" : "说说你的想法…（Ctrl+Enter 发送）"}
            className="min-h-[68px] resize-none text-[13px]"
            disabled={sending}
          />
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setComposing(false)}
              disabled={sending}
            >
              取消
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => void send(false)}
              disabled={sending || !draft.trim()}
            >
              回复
            </Button>
            <Button
              size="sm"
              className="h-8 gap-1 text-xs"
              onClick={() => void send(true)}
              disabled={sending || novaBusy || !draft.trim()}
            >
              <Sparkles className="size-3.5" />
              回复并请 Nova 接话
            </Button>
          </div>
        </div>
      )}

      {/* 帖子底部操作 */}
      {!composing && (
        <div className="flex items-center gap-1 border-t px-2 py-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-muted-foreground text-xs"
            onClick={() => setComposing(true)}
          >
            <MessageSquare className="size-3.5" />
            回复
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-8 gap-1 text-primary text-xs"
            onClick={() => void askNova()}
            disabled={novaBusy}
          >
            {novaBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            {novaLabel}
          </Button>
        </div>
      )}
    </article>
  );
};

interface FloorProps {
  note: BookNote;
  floor: number;
  kind: ThreadKind;
  isTop?: boolean;
  selected?: boolean;
  mode?: CommentReviewMode;
  onCopy: () => Promise<boolean>;
  onJump?: () => void;
  onRegenerate?: () => void;
  onDelete: () => void;
}

const Floor = ({
  note,
  floor,
  kind,
  isTop = false,
  selected = false,
  mode,
  onCopy,
  onJump,
  onRegenerate,
  onDelete,
}: FloorProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const isNova = note.author === "ai";
  const content = note.note?.trim() ?? "";

  return (
    <div
      data-annotation-id={note.id}
      tabIndex={-1}
      aria-current={selected ? "true" : undefined}
      className={`group px-3 py-2 outline-none transition-colors ${selected ? "bg-primary/10" : ""}`}
      onContextMenu={(event) => {
        // 电脑上右键 = 打开同一个菜单（平板点右上角「⋯」）
        event.preventDefault();
        setMenuOpen(true);
      }}
    >
      <div className="flex items-center gap-1.5 text-[11px]">
        {isNova ? (
          <img src={NOVA_STATIC_AVATAR} alt="" className="size-5 shrink-0 rounded-full" />
        ) : (
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-amber-500/15 font-medium text-[10px] text-amber-700 dark:text-amber-300">
            我
          </span>
        )}
        <span className={`font-medium ${isNova ? "text-primary" : "text-foreground"}`}>{isNova ? "Nova" : "我"}</span>
        {isTop ? (
          <span className="rounded bg-muted px-1 py-px text-[10px] text-muted-foreground">楼主</span>
        ) : (
          <span className="text-muted-foreground">#{floor}</span>
        )}
        {mode && (
          <span className="rounded-full bg-primary/10 px-1.5 py-px text-[10px] text-primary">
            {REVIEW_MODE_LABEL[mode]}
          </span>
        )}
        <span className="text-muted-foreground">{dayjs(note.createdAt).format("MM-DD HH:mm")}</span>
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="更多操作"
              className="ml-auto flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem
              onClick={async () => {
                if (await onCopy()) toast.success("已复制");
                else toast.error("复制失败");
              }}
            >
              <Copy className="size-3.5" />
              复制
            </DropdownMenuItem>
            {onJump && (
              <DropdownMenuItem onClick={onJump}>
                <MapPin className="size-3.5" />
                定位原文
              </DropdownMenuItem>
            )}
            {onRegenerate && (
              <DropdownMenuItem onClick={onRegenerate}>
                <RefreshCw className="size-3.5" />让 Nova 重新回评
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
              <Trash2 className="size-3.5" />
              {isTop ? (kind === "book" ? "删除书评" : "删除整个帖子") : "删除这一楼"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {content ? (
        <p className="mt-1 whitespace-pre-wrap break-words pl-[26px] text-[13px] text-foreground leading-relaxed">
          {content}
        </p>
      ) : (
        isTop && kind === "passage" && <p className="mt-1 pl-[26px] text-[12px] text-muted-foreground">划了这句</p>
      )}
    </div>
  );
};

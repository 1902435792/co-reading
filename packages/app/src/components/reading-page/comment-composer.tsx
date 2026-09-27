import { NOVA_STATIC_AVATAR } from "@/components/nova/nova-assets";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { MessageSquareText } from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";

const ASK_NOVA_KEY = "deepreader:comment-ask-nova";

export interface CommentComposerProps {
  style: React.CSSProperties;
  quote: string;
  initialNote?: string;
  editing?: boolean;
  onCancel: () => void;
  onSubmit: (note: string, askNova: boolean) => void | Promise<void>;
}

/** 划线评论：写完自动加波浪线，可选让 Nova 回评。Ctrl+Enter 发布，Esc 取消。 */
export function CommentComposer({ style, quote, initialNote = "", editing, onCancel, onSubmit }: CommentComposerProps) {
  const [note, setNote] = useState(initialNote);
  const [askNova, setAskNova] = useState(() => {
    try {
      return localStorage.getItem(ASK_NOVA_KEY) !== "false";
    } catch {
      return true;
    }
  });
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }, 60);
    return () => window.clearTimeout(timer);
  }, []);

  const toggleAskNova = (value: boolean) => {
    setAskNova(value);
    try {
      localStorage.setItem(ASK_NOVA_KEY, String(value));
    } catch {
      /* 忽略存储失败 */
    }
  };

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(note.trim(), askNova);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="dr-rise-in absolute z-50 flex flex-col gap-2 rounded-xl border bg-popover p-3 text-popover-foreground shadow-xl"
      style={style}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          void submit();
        }
      }}
    >
      <div className="flex items-center gap-1.5 font-medium text-muted-foreground text-xs">
        <MessageSquareText className="size-3.5" />
        {editing ? "修改评论" : "写评论"}
      </div>
      <p
        className="line-clamp-2 text-foreground/80 text-xs leading-relaxed"
        style={{
          textDecorationLine: "underline",
          textDecorationStyle: "wavy",
          textDecorationColor: "color-mix(in srgb, var(--primary) 55%, transparent)",
          textUnderlineOffset: "3px",
        }}
      >
        {quote}
      </p>
      <textarea
        ref={textareaRef}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        rows={3}
        placeholder="写下你的想法、疑问或感受…"
        className="w-full resize-none rounded-lg border bg-background px-2.5 py-2 text-sm leading-relaxed outline-none transition-shadow placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/40"
      />
      <div className="flex items-center justify-between gap-2">
        <label className="flex cursor-pointer select-none items-center gap-1.5 text-muted-foreground text-xs">
          <Switch checked={askNova} onCheckedChange={toggleAskNova} className="scale-90" />
          <img src={NOVA_STATIC_AVATAR} alt="" className="size-4 rounded-full" />让 Nova 回评
        </label>
        <div className="flex items-center gap-1.5">
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onCancel}>
            取消
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-7 px-3 text-xs"
            disabled={submitting}
            onClick={() => void submit()}
          >
            {editing ? "保存" : "发布"}
          </Button>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground/80">Ctrl+Enter 发布 · Esc 取消 · 发布后原文加波浪线</p>
    </div>
  );
}

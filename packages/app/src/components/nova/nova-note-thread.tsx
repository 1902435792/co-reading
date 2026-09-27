import { Button } from "@/components/ui/button";
import { resolveCoReadingAgentModel } from "@/services/co-reading-agent-request";
import type { CoReadingSettings } from "@/types/co-reading";
import { generateText } from "ai";
import { LoaderCircle, MessageCircle, SendHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  NOTE_THREAD_EVENT,
  type NoteThreadMessage,
  buildNoteThreadReplyPrompt,
  cleanNoteThreadReply,
  getNoteThread,
  saveNoteThreadMessage,
} from "./nova-threads";

const REPLY_TIMEOUT_MS = 90_000;

interface NovaNoteThreadProps {
  bookId: string;
  annotationId: string;
  quote: string;
  comment: string;
  bookTitle?: string;
  sectionLabel?: string;
  settings?: Pick<CoReadingSettings, "modelProviderId" | "modelId"> | null;
}

/** Nova 边注下的评论区：读者回复，Nova 接着回。 */
export function NovaNoteThread({
  bookId,
  annotationId,
  quote,
  comment,
  bookTitle,
  sectionLabel,
  settings,
}: NovaNoteThreadProps) {
  const [messages, setMessages] = useState<NoteThreadMessage[]>(() => getNoteThread(bookId, annotationId));
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMessages(getNoteThread(bookId, annotationId));
    setError("");
    setDraft("");
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
  }, [bookId, annotationId]);

  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ bookId?: string; annotationId?: string }>).detail;
      if (detail?.bookId === bookId && detail.annotationId === annotationId) {
        setMessages(getNoteThread(bookId, annotationId));
      }
    };
    window.addEventListener(NOTE_THREAD_EVENT, onChange);
    return () => window.removeEventListener(NOTE_THREAD_EVENT, onChange);
  }, [bookId, annotationId]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    const list = listRef.current;
    if (list && messages.length + (busy ? 1 : 0) > 0) list.scrollTop = list.scrollHeight;
  }, [messages, busy]);

  const askNova = async (thread: NoteThreadMessage[]) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const timer = window.setTimeout(() => controller.abort(), REPLY_TIMEOUT_MS);
    setBusy(true);
    setError("");
    try {
      const { system, prompt } = buildNoteThreadReplyPrompt({ bookTitle, sectionLabel, quote, comment, thread });
      const result = await generateText({
        model: resolveCoReadingAgentModel(settings),
        system,
        prompt,
        maxOutputTokens: 600,
        temperature: 0.7,
        maxRetries: 0,
        abortSignal: controller.signal,
      });
      const reply = cleanNoteThreadReply(result.text);
      if (!reply) throw new Error("Nova 这次没说出话来");
      if (abortRef.current === controller) {
        setMessages(saveNoteThreadMessage(bookId, annotationId, { role: "nova", text: reply, at: Date.now() }));
      }
    } catch (err) {
      if (abortRef.current !== controller) return;
      const message = controller.signal.aborted ? "等太久了" : err instanceof Error ? err.message : String(err);
      setError(`${message}，稍后点「让 Nova 回」重试`);
    } finally {
      window.clearTimeout(timer);
      if (abortRef.current === controller) {
        abortRef.current = null;
        setBusy(false);
      }
    }
  };

  const send = () => {
    const text = draft.trim();
    if (!text || busy) return;
    const thread = saveNoteThreadMessage(bookId, annotationId, { role: "reader", text, at: Date.now() });
    setMessages(thread);
    setDraft("");
    void askNova(thread);
  };

  const waitingForNova = !busy && messages.length > 0 && messages[messages.length - 1].role === "reader";

  return (
    <div className="mt-2 border-border/70 border-t pt-2">
      <div className="mb-1 flex items-center gap-1 text-[11px] text-muted-foreground">
        <MessageCircle className="size-3" />
        评论区{messages.length > 0 ? ` · ${messages.length}` : ""}
      </div>
      {(messages.length > 0 || busy) && (
        <div ref={listRef} className="mb-2 max-h-64 space-y-1.5 overflow-y-auto pr-1">
          {messages.map((item, index) => (
            <div
              key={`${item.at}-${index}`}
              className={`dr-rise-in rounded-md px-2 py-1 leading-relaxed ${
                item.role === "reader" ? "ml-6 bg-primary/10 text-foreground" : "mr-6 bg-background text-foreground"
              }`}
            >
              <span className="mr-1 font-medium text-[10px] text-muted-foreground">
                {item.role === "reader" ? "我" : "Nova"}
              </span>
              <span className="whitespace-pre-wrap break-words">{item.text}</span>
            </div>
          ))}
          {busy && (
            <div className="mr-6 flex items-center gap-1 rounded-md bg-background px-2 py-1 text-muted-foreground">
              <LoaderCircle className="size-3 animate-spin" />
              Nova 在想…
            </div>
          )}
        </div>
      )}
      {error && <p className="mb-1 text-[11px] text-destructive">{error}</p>}
      <div className="flex items-end gap-1">
        <textarea
          value={draft}
          rows={1}
          maxLength={1200}
          placeholder="回复 Nova…（Enter 发送，Shift+Enter 换行）"
          aria-label="回复 Nova 的边注"
          className="max-h-24 min-h-7 flex-1 resize-none rounded-md border bg-background px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              send();
            }
          }}
        />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-7 shrink-0"
          aria-label="发送"
          disabled={busy || !draft.trim()}
          onClick={send}
        >
          <SendHorizontal className="size-3.5" />
        </Button>
      </div>
      {waitingForNova && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="mt-1 h-6 px-1 text-[11px]"
          onClick={() => void askNova(messages)}
        >
          让 Nova 回
        </Button>
      )}
    </div>
  );
}

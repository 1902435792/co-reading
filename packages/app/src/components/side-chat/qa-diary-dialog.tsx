import { trackDiaryWrite } from "@/services/diary-background";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  QA_DIARY_COUNT_PRESETS,
  QA_DIARY_DEFAULT_COUNT,
  type QaMessageLike,
  buildQaDiaryPayload,
  extractQaPairs,
  loadQaDiaryWritten,
  markQaDiaryWritten,
  selectUnwrittenQaPairs,
} from "@/lib/qa-diary";
import { postVcpDiaryPayload } from "@/services/co-reading-diary-service";
import { LoaderCircle, NotebookPen } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

interface QaDiaryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookId: string;
  bookTitle: string;
  sectionLabel?: string;
  messages: ReadonlyArray<QaMessageLike>;
}

export function QaDiaryDialog({ open, onOpenChange, bookId, bookTitle, sectionLabel, messages }: QaDiaryDialogProps) {
  const [count, setCount] = useState<number>(QA_DIARY_DEFAULT_COUNT);
  const [written, setWritten] = useState<Set<string>>(() => new Set());
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setWritten(loadQaDiaryWritten(bookId));
    setFeedback(null);
  }, [bookId, open]);

  const pairs = useMemo(() => extractQaPairs(messages), [messages]);
  const unwrittenCount = useMemo(() => pairs.filter((pair) => !written.has(pair.id)).length, [pairs, written]);
  const selected = useMemo(() => selectUnwrittenQaPairs(pairs, written, count), [pairs, written, count]);

  const submit = async () => {
    try {
      setSubmitting(true);
      setFeedback(null);
      const payload = buildQaDiaryPayload({ bookTitle, pairs: selected, sectionLabel });
      // 后台写入：对话框关掉也会继续，写完弹通知。
      const confirmed = await trackDiaryWrite(postVcpDiaryPayload(payload));
      setWritten(
        markQaDiaryWritten(
          bookId,
          selected.map((pair) => pair.id),
        ),
      );
      const message = confirmed.message || `VCP 已把 ${selected.length} 组问答写进今天的日记`;
      setFeedback({ kind: "success", message });
      toast.success(message);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setFeedback({ kind: "error", message });
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <NotebookPen className="size-4 text-primary" />
            写问答日记
          </DialogTitle>
          <DialogDescription>
            把当前对话里还没写过的问答交给 VCP，由日记 Nova 整理后写进阅读日记，和共读日记走同一个接口。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground text-xs">
            当前对话共 {pairs.length} 组问答，未写入 {unwrittenCount} 组，本次写入最近 {selected.length} 组。
          </p>
          <div className="flex flex-wrap gap-2">
            {QA_DIARY_COUNT_PRESETS.map((preset) => (
              <Button
                key={preset}
                type="button"
                size="sm"
                variant={count === preset ? "default" : "outline"}
                onClick={() => setCount(preset)}
              >
                最近 {preset} 组
              </Button>
            ))}
          </div>
          {selected.length > 0 && (
            <ol className="max-h-60 space-y-2 overflow-y-auto rounded-md border p-2 text-xs">
              {selected.map((pair) => (
                <li key={pair.id} className="space-y-0.5">
                  <p className="line-clamp-2 font-medium">问：{pair.question}</p>
                  <p className="line-clamp-2 text-muted-foreground">答：{pair.answer}</p>
                </li>
              ))}
            </ol>
          )}
          {feedback && (
            <p className={`text-xs ${feedback.kind === "error" ? "text-destructive" : "text-emerald-600"}`}>
              {feedback.message}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {submitting ? "后台继续写" : "关闭"}
          </Button>
          <Button type="button" disabled={submitting || selected.length === 0} onClick={() => void submit()}>
            {submitting && <LoaderCircle className="mr-1 size-4 animate-spin" />}
            写入 {selected.length} 组
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

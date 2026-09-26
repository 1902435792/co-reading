import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { gradeAnswerWithJev, isJevConfigured, useJevSettings } from "@/services/jev-service";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { type ChapterCard, buildAnswerGradeState, chapterCardFileName, chapterCardToMarkdown } from "./chapter-card";
import { exportMarkdownToObsidian, getObsidianVaultPath } from "./chapter-card-export";
import { NOVA_STATIC_AVATAR } from "./nova-assets";

type Grade = number | "loading" | "failed" | null;

function gradeText(grade: Grade): { text: string; tone: string } | null {
  if (grade === null) return null;
  if (grade === "loading") return { text: "Jev 正在看…", tone: "text-muted-foreground" };
  if (grade === "failed") return { text: "Jev 没能打分，看看参考答案吧", tone: "text-muted-foreground" };
  const percent = Math.round(grade * 100);
  if (grade >= 0.7)
    return { text: `Jev：答到点上了（把握 ${percent}%）`, tone: "text-emerald-600 dark:text-emerald-400" };
  if (grade >= 0.4) return { text: `Jev：沾点边（把握 ${percent}%）`, tone: "text-amber-600 dark:text-amber-400" };
  return { text: `Jev：好像没答到点上（把握 ${percent}%）`, tone: "text-rose-600 dark:text-rose-400" };
}

export function ChapterCardDialog({
  card,
  onOpenChange,
}: {
  card: ChapterCard | null;
  onOpenChange: (open: boolean) => void;
}) {
  const jevReady = isJevConfigured(useJevSettings());
  const [answers, setAnswers] = useState<string[]>([]);
  const [revealed, setRevealed] = useState<boolean[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [exporting, setExporting] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: 换一张卡片时清空作答
  useEffect(() => {
    setAnswers([]);
    setRevealed([]);
    setGrades([]);
  }, [card?.id]);

  if (!card) return null;

  const setAt = <T,>(list: T[], index: number, value: T) => {
    const next = [...list];
    next[index] = value;
    return next;
  };
  const grade = async (index: number) => {
    const item = card.questions[index];
    const answer = answers[index]?.trim();
    if (!item || !answer) return;
    setGrades((current) => setAt(current, index, "loading"));
    const result = await gradeAnswerWithJev(buildAnswerGradeState(item.question, item.answer, answer));
    setGrades((current) => setAt(current, index, result === null ? "failed" : result));
    setRevealed((current) => setAt(current, index, true));
  };
  const markdown = () => chapterCardToMarkdown(card, answers);
  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(markdown());
      toast.success("已复制为 Markdown");
    } catch {
      toast.error("复制失败");
    }
  };
  const exportObsidian = async () => {
    setExporting(true);
    try {
      const path = await exportMarkdownToObsidian(chapterCardFileName(card), markdown());
      toast.success("已保存到 Obsidian", { description: path });
    } catch (error) {
      toast.error("导出失败", { description: error instanceof Error ? error.message : String(error) });
    } finally {
      setExporting(false);
    }
  };
  const vaultReady = Boolean(getObsidianVaultPath());

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-base">章末卡片 · {card.sectionLabel}</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 px-4 py-4 text-sm">
          <div className="flex gap-3">
            <img src={NOVA_STATIC_AVATAR} alt="" className="size-9 shrink-0 rounded-full border" />
            <p className="rounded-2xl rounded-tl-sm bg-amber-50 px-3 py-2 leading-relaxed dark:bg-amber-950/60">
              {card.summary}
            </p>
          </div>

          {card.points.length > 0 && (
            <section>
              <h3 className="mb-2 font-medium text-muted-foreground text-xs">要点</h3>
              <ol className="list-decimal space-y-1 pl-5 leading-relaxed">
                {card.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ol>
            </section>
          )}

          {card.questions.length > 0 && (
            <section className="space-y-4">
              <h3 className="font-medium text-muted-foreground text-xs">
                自测{jevReady ? "（写下你的回答，Jev 帮你打分）" : "（想一想，再看参考答案）"}
              </h3>
              {card.questions.map((item, index) => {
                const status = gradeText(grades[index] ?? null);
                return (
                  <div key={item.question} className="space-y-2 rounded-lg border p-3">
                    <p className="font-medium leading-relaxed">
                      {index + 1}. {item.question}
                    </p>
                    <Textarea
                      value={answers[index] ?? ""}
                      onChange={(event) => setAnswers((current) => setAt(current, index, event.target.value))}
                      placeholder="写下你的想法（可以不写）"
                      className="min-h-16 text-sm"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => setRevealed((current) => setAt(current, index, !current[index]))}
                      >
                        {revealed[index] ? "收起参考答案" : "看参考答案"}
                      </Button>
                      {jevReady && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={!answers[index]?.trim() || grades[index] === "loading"}
                          onClick={() => void grade(index)}
                        >
                          {grades[index] === "loading" && <Loader2 className="size-3 animate-spin" />}让 Jev 打分
                        </Button>
                      )}
                      {status && <span className={`text-xs ${status.tone}`}>{status.text}</span>}
                    </div>
                    {revealed[index] && (
                      <p className="rounded-md bg-muted px-3 py-2 text-muted-foreground text-xs leading-relaxed">
                        参考答案：{item.answer}
                      </p>
                    )}
                  </div>
                );
              })}
            </section>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t px-4 py-3">
          <Button size="sm" variant="outline" onClick={() => void copyMarkdown()}>
            复制 Markdown
          </Button>
          <Button
            size="sm"
            disabled={!vaultReady || exporting}
            title={vaultReady ? "保存到 Obsidian 库根目录" : "先在设置里填写 Obsidian 库路径"}
            onClick={() => void exportObsidian()}
          >
            {exporting && <Loader2 className="size-3 animate-spin" />}
            导出到 Obsidian
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

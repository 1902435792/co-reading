/** 章末卡片：提示词、解析和导出，纯函数。 */

export interface ChapterCardQuestion {
  question: string;
  answer: string;
}

export interface ChapterCardContent {
  summary: string;
  points: string[];
  questions: ChapterCardQuestion[];
}

export interface ChapterCard extends ChapterCardContent {
  id: string;
  bookId: string;
  bookTitle: string;
  sectionIndex: number;
  sectionLabel: string;
  createdAt: number;
}

export const CHAPTER_CARD_MAX_CHARS = 12_000;
/** 在一章里至少读了这么久，翻到下一章时才问要不要做卡片。 */
export const CHAPTER_CARD_MIN_ACTIVE_MS = 2 * 60_000;

export function shouldOfferChapterCard(input: {
  fromIndex: number | null;
  toIndex: number | null;
  activeMsInSection: number;
}): boolean {
  if (input.fromIndex === null || input.toIndex === null) return false;
  return input.toIndex === input.fromIndex + 1 && input.activeMsInSection >= CHAPTER_CARD_MIN_ACTIVE_MS;
}

export function clipChapterText(text: string, max = CHAPTER_CARD_MAX_CHARS): string {
  const clean = text
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*/g, "\n")
    .trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export function buildChapterCardPrompt(input: { bookTitle: string; sectionLabel: string; text: string }): {
  system: string;
  prompt: string;
} {
  const system = [
    "你是 Nova，刚和读者一起读完一章。请做一张章末卡片，帮读者巩固这一章。",
    "只输出一个 JSON 对象，不要任何其他文字，格式：",
    '{"summary":"不超过 120 字的小结","points":["要点1","要点2","要点3"],"questions":[{"question":"问题","answer":"参考答案，不超过 60 字"}]}',
    "points 恰好 3 条，每条不超过 40 字；questions 恰好 3 道，考理解而不是死记，答案只依据本章内容。用简体中文。",
  ].join("\n");
  const prompt = `书名：《${input.bookTitle}》\n章节：${input.sectionLabel}\n\n本章正文：\n${clipChapterText(input.text)}`;
  return { system, prompt };
}

const asText = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/** 容忍模型在 JSON 外面包代码块或多说几句。 */
export function parseChapterCardJson(text: string): ChapterCardContent | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const data = raw as { summary?: unknown; points?: unknown; questions?: unknown };
  const summary = asText(data.summary);
  const points = Array.isArray(data.points) ? data.points.map(asText).filter(Boolean).slice(0, 5) : [];
  const questions = Array.isArray(data.questions)
    ? data.questions
        .map((item) => {
          const entry = (item && typeof item === "object" ? item : {}) as { question?: unknown; answer?: unknown };
          return { question: asText(entry.question), answer: asText(entry.answer) };
        })
        .filter((item) => item.question && item.answer)
        .slice(0, 5)
    : [];
  if (!summary && points.length === 0 && questions.length === 0) return null;
  return { summary, points, questions };
}

export function chapterCardFileName(card: Pick<ChapterCard, "bookTitle" | "sectionLabel">): string {
  return `${card.bookTitle}-${card.sectionLabel}-章末卡片`.replace(/[\\/:*?"<>|]/g, "_").trim();
}

export function chapterCardToMarkdown(card: ChapterCard, myAnswers: readonly string[] = []): string {
  const date = new Date(card.createdAt).toISOString().slice(0, 10);
  const lines = [
    "---",
    `title: ${JSON.stringify(`${card.bookTitle} · ${card.sectionLabel}`)}`,
    `book: ${JSON.stringify(card.bookTitle)}`,
    `chapter: ${JSON.stringify(card.sectionLabel)}`,
    `date: ${date}`,
    "tags: [deepreader, 章末卡片]",
    "---",
    "",
    `# ${card.sectionLabel}`,
    "",
    "## 小结",
    "",
    card.summary,
    "",
    "## 要点",
    "",
    ...card.points.map((point) => `- ${point}`),
    "",
    "## 自测",
    "",
  ];
  card.questions.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.question}`);
    const mine = myAnswers[index]?.trim();
    if (mine) lines.push(`   - 我的回答：${mine}`);
    lines.push(`   - 参考答案：${item.answer}`);
  });
  return `${lines.join("\n")}\n`;
}

export function buildAnswerGradeState(question: string, reference: string, answer: string): string {
  return `问题：${question.trim()}\n\n参考答案：${reference.trim()}\n\n读者的回答：${answer.trim().slice(0, 600)}`;
}

// Jev（TypeSafe AI 的决策模型）相关的纯逻辑：请求构造、答案解析、判定规则。
// 这里不依赖 Tauri 或资源文件，方便单元测试。

/** typesafe = TypeSafe 原生 System One 接口（/v1/systemone，也适用于兼容的中转服务）。 */
export type JevEndpoint = "typesafe" | "openrouter" | "workers-ai";
/** conservative = 只跳过目录/版权页等非正文；normal / eager = 还会跳过“不值得批注”的正文页。 */
export type JevSkipLevel = "conservative" | "normal" | "eager";

export interface JevSettings {
  /** 共读预筛：调用共读 Agent 前先判断这一页值不值得批注。 */
  prefilter: boolean;
  /** Nova 表情：根据书评内容挑选表情。 */
  mood: boolean;
  endpoint: JevEndpoint;
  /** 留空时，OpenRouter 会沿用「模型提供商」里 OpenRouter 的 Key。 */
  apiKey: string;
  /** typesafe / workers-ai 使用的完整地址，例如 https://…/v1/systemone 或 https://api.cloudflare.com/client/v4/accounts/<ID>/ai/run */
  baseUrl: string;
  /** 留空使用默认模型。 */
  model: string;
  skipLevel: JevSkipLevel;
}

export const DEFAULT_JEV_SETTINGS: JevSettings = {
  prefilter: false,
  mood: false,
  endpoint: "openrouter",
  apiKey: "",
  baseUrl: "",
  model: "",
  skipLevel: "conservative",
};

export const OPENROUTER_DECISIONS_URL = "https://openrouter.ai/api/alpha/decisions";

export function defaultJevModel(endpoint: JevEndpoint): string {
  if (endpoint === "typesafe") return "jev-latest";
  return endpoint === "openrouter" ? "typesafe/jev-1.13" : "typesafe/jev";
}

/** 需要填写接口地址的类型。 */
export function jevEndpointNeedsUrl(endpoint: JevEndpoint): boolean {
  return endpoint !== "openrouter";
}

export function normalizeJevSettings(value: unknown): JevSettings {
  const raw = (value && typeof value === "object" ? value : {}) as Partial<JevSettings>;
  return {
    prefilter: raw.prefilter === true,
    mood: raw.mood === true,
    endpoint: raw.endpoint === "workers-ai" || raw.endpoint === "typesafe" ? raw.endpoint : "openrouter",
    apiKey: typeof raw.apiKey === "string" ? raw.apiKey.trim() : "",
    baseUrl: typeof raw.baseUrl === "string" ? raw.baseUrl.trim() : "",
    model: typeof raw.model === "string" ? raw.model.trim() : "",
    skipLevel: raw.skipLevel === "normal" || raw.skipLevel === "eager" ? raw.skipLevel : "conservative",
  };
}

export type JevQuestion =
  | { type: "noul"; instructions: string; criteria?: { true: string; false: string } }
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "score"; instructions: string; criteria: string[] };

export interface JevAnswer {
  type?: string;
  choice?: string;
  confidence?: number;
  probabilities?: Record<string, number>;
  noul?: number;
  /** Vercel AI SDK 等把 noul 叫作 boolean / probability。 */
  probability?: number;
  score?: number;
}

export function buildJevRequest(
  settings: Pick<JevSettings, "endpoint" | "baseUrl" | "model">,
  state: string,
  questions: Record<string, JevQuestion>,
): { url: string; body: Record<string, unknown> } {
  const model = settings.model || defaultJevModel(settings.endpoint);
  if (settings.endpoint === "workers-ai") {
    return { url: settings.baseUrl, body: { model, input: { state, questions } } };
  }
  if (settings.endpoint === "typesafe") {
    return { url: settings.baseUrl, body: { model, state, questions } };
  }
  return { url: OPENROUTER_DECISIONS_URL, body: { model, state, questions } };
}

/** 兼容 OpenRouter（{answers}）和 Workers AI（{result:{answers}}）两种返回。 */
export function extractJevAnswers(body: unknown): Record<string, JevAnswer> | null {
  if (!body || typeof body !== "object") return null;
  const record = body as { answers?: unknown; result?: { answers?: unknown } };
  const answers = record.answers ?? record.result?.answers;
  return answers && typeof answers === "object" ? (answers as Record<string, JevAnswer>) : null;
}

export function noulOf(answer: JevAnswer | undefined): number | null {
  const value = answer?.noul ?? answer?.probability;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function choiceConfidence(answer: JevAnswer | undefined): number {
  if (!answer?.choice) return 0;
  const byProbability = answer.probabilities?.[answer.choice];
  if (typeof byProbability === "number") return byProbability;
  return typeof answer.confidence === "number" ? answer.confidence : 0;
}

// ---------- 共读预筛 ----------

export const PAGE_GATE_QUESTIONS: Record<string, JevQuestion> = {
  page_kind: {
    type: "choice",
    instructions: "这一页书属于哪一类内容？",
    criteria: {
      body: "正文：叙事、对话、论证、说明等书的主体内容",
      front_matter: "目录、版权页、扉页、献词、出版信息、推荐语",
      back_matter: "参考文献、注释列表、索引、致谢、附录表格",
      other: "图片说明、空白页、广告，或几乎没有文字",
    },
  },
  worth_annotating: {
    type: "noul",
    instructions:
      "这一页里是否有值得认真的读者停下来写页边批注的地方？例如情节转折、精彩的表达、关键论点、情感高点、伏笔或值得质疑的说法。",
    criteria: { true: "至少有一处值得批注", false: "平铺直叙或过渡性内容，没有值得批注的地方" },
  },
};

const PAGE_KIND_LABEL: Record<string, string> = {
  front_matter: "目录/版权页",
  back_matter: "参考文献/索引",
  other: "非正文页",
};

const WORTH_THRESHOLD: Record<JevSkipLevel, number> = {
  conservative: -1,
  normal: 0.15,
  eager: 0.3,
};

export interface JevPageGate {
  skip: boolean;
  reason: string;
  pageKind: string | null;
  worth: number | null;
}

export function decidePageGate(answers: Record<string, JevAnswer>, level: JevSkipLevel): JevPageGate {
  const kind = answers.page_kind?.choice ?? null;
  const kindConfidence = choiceConfidence(answers.page_kind);
  const worth = noulOf(answers.worth_annotating);
  if (kind && kind !== "body" && kindConfidence >= 0.7) {
    return { skip: true, reason: PAGE_KIND_LABEL[kind] ?? "非正文页", pageKind: kind, worth };
  }
  if (worth !== null && worth < WORTH_THRESHOLD[level]) {
    return { skip: true, reason: `没有值得批注的地方（${Math.round(worth * 100)}%）`, pageKind: kind, worth };
  }
  return { skip: false, reason: "", pageKind: kind, worth };
}

export function buildPageState(blocks: readonly { text: string; sectionLabel?: string }[], maxChars = 6_000): string {
  const section = blocks.find((block) => block.sectionLabel)?.sectionLabel ?? "";
  const text = blocks
    .map((block) => block.text.trim())
    .filter(Boolean)
    .join("\n\n");
  const clipped = text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
  return section ? `章节：${section}\n\n${clipped}` : clipped;
}

// ---------- Nova 表情 ----------

export interface NovaReactionOption {
  criteria: string;
  mood: "talking" | "found" | "thinking" | "error";
  /** 对应 assets/nova/<image>.webp */
  image: string;
}

export const NOVA_REACTION_OPTIONS: Record<string, NovaReactionOption> = {
  agree: { criteria: "赞同、认可作者或角色的观点", mood: "talking", image: "talk-agree" },
  amused: { criteria: "觉得好笑、有趣、俏皮", mood: "talking", image: "talk-fun" },
  admire: { criteria: "赞叹写得精彩、漂亮、到位", mood: "talking", image: "talk-great" },
  surprised: { criteria: "惊讶，意外的转折或信息", mood: "talking", image: "talk-wow" },
  insight: { criteria: "恍然大悟，发现了联系、伏笔或深意", mood: "found", image: "found-eureka" },
  warm: { criteria: "温暖、开心、被治愈", mood: "found", image: "found-joy" },
  moved: { criteria: "被打动、憧憬、心生向往", mood: "found", image: "found-stars" },
  puzzled: { criteria: "困惑、难懂、需要细想", mood: "thinking", image: "think-hard" },
  doubt: { criteria: "质疑、不同意、觉得论证有问题", mood: "thinking", image: "think-tilt" },
  sad: { criteria: "悲伤、心疼、遗憾", mood: "error", image: "error-cry" },
  indignant: { criteria: "愤慨、委屈、为角色抱不平", mood: "error", image: "error-aggrieved" },
  shocked: { criteria: "震惊、难以置信、沉重", mood: "error", image: "error-stunned" },
};

export const NOVA_REACTION_QUESTIONS: Record<string, JevQuestion> = {
  reaction: {
    type: "choice",
    instructions: "读者 Nova 写下这条页边批注时，最主要的情绪反应是什么？",
    criteria: Object.fromEntries(Object.entries(NOVA_REACTION_OPTIONS).map(([key, option]) => [key, option.criteria])),
  },
};

/** 边注价值：判断 Nova 这条批注是否有洞见，用来决定墨点深浅。 */
export const NOTE_WORTH_QUESTIONS: Record<string, JevQuestion> = {
  insightful: {
    type: "noul",
    instructions:
      "这条页边批注是否有洞见、值得读者停下来看？点出伏笔、联系、言外之意，或提出有力的质疑算有洞见；复述原文、泛泛感叹不算。",
  },
};

export function noteWorthOf(answers: Record<string, JevAnswer>): number | null {
  return noulOf(answers.insightful);
}

export function buildReactionState(quote: string, comment: string): string {
  return `原文：${quote.trim().slice(0, 600)}\n\nNova 的批注：${comment.trim().slice(0, 800)}`;
}

export function pickNovaReaction(answers: Record<string, JevAnswer>, minConfidence = 0.35): NovaReactionOption | null {
  const answer = answers.reaction;
  const option = answer?.choice ? NOVA_REACTION_OPTIONS[answer.choice] : undefined;
  if (!option || choiceConfidence(answer) < minConfidence) return null;
  return option;
}

// ---------- 卡住探头 ----------

export const PASSAGE_DIFFICULTY_QUESTIONS: Record<string, JevQuestion> = {
  hard_to_follow: {
    type: "noul",
    instructions:
      "普通读者读这一页时，是否容易卡住、需要别人帮忙解释？例如概念密集、论证跳跃、生僻典故、复杂句式或人物关系混乱。",
    criteria: { true: "比较难懂，值得解释", false: "通顺易懂，不需要解释" },
  },
};

/** 返回 null 表示 Jev 没给出可用的判断。 */
export function isPassageHard(answers: Record<string, JevAnswer>, threshold = 0.5): boolean | null {
  const value = noulOf(answers.hard_to_follow);
  return value === null ? null : value >= threshold;
}

// ---------- 章末卡片 · 自测打分 ----------

export const ANSWER_GRADE_QUESTIONS: Record<string, JevQuestion> = {
  captures_main_idea: {
    type: "noul",
    instructions:
      "读者的回答是否抓住了参考答案的主要意思？措辞不同、更简短或补充了自己的理解都可以，只看核心意思是否对上。",
    criteria: { true: "抓住了主要意思", false: "没有抓住，或答非所问" },
  },
};

/** 0–1 的把握度；null 表示 Jev 没给出可用的判断。 */
export function answerGradeOf(answers: Record<string, JevAnswer>): number | null {
  return noulOf(answers.captures_main_idea);
}

// ---------- 情绪曲线 ----------

export const EMOTION_QUESTIONS: Record<string, JevQuestion> = {
  tone: {
    type: "choice",
    instructions: "这一页文字整体传达的情绪基调是什么？看叙述和描写本身，不看读者可能的感受。",
    criteria: {
      positive: "明亮：温暖、喜悦、希望、振奋、幽默",
      neutral: "平静：客观、说明性、论述性，情绪不明显",
      negative: "低沉：悲伤、紧张、愤怒、压抑、恐惧",
    },
  },
  intense: {
    type: "noul",
    instructions: "这一页的情绪是否强烈、有感染力？",
    criteria: { true: "情绪强烈", false: "情绪平淡" },
  },
};

/** valence：-1（低沉）到 1（明亮）；intensity：0–1。null 表示 Jev 没给出可用的判断。 */
export function emotionFromAnswers(answers: Record<string, JevAnswer>): { valence: number; intensity: number } | null {
  const tone = answers.tone;
  if (!tone) return null;
  let valence: number | null = null;
  const probabilities = tone.probabilities;
  if (probabilities && Object.keys(probabilities).length > 0) {
    valence = (probabilities.positive ?? 0) - (probabilities.negative ?? 0);
  } else if (tone.choice) {
    const sign = tone.choice === "positive" ? 1 : tone.choice === "negative" ? -1 : 0;
    valence = sign * choiceConfidence(tone);
  }
  if (valence === null || !Number.isFinite(valence)) return null;
  const intensity = noulOf(answers.intense) ?? 0.5;
  return {
    valence: Math.round(Math.max(-1, Math.min(1, valence)) * 1000) / 1000,
    intensity: Math.round(Math.max(0, Math.min(1, intensity)) * 1000) / 1000,
  };
}

// ---------- 读者评论：Nova 回评方式 ----------

export type CommentReviewMode = "explain" | "feel";

export const COMMENT_REVIEW_MODE_QUESTIONS: Record<string, JevQuestion> = {
  review_mode: {
    type: "choice",
    instructions:
      "读者在书上划了一段并写了评论。Nova 回评时，读者更需要哪一种？看读者评论的语气：有疑问、没看懂、想弄清概念/背景/论证时选 explain；在表达感受、共鸣、联想、态度时选 feel。",
    criteria: {
      explain: "解释：把这段讲清楚（概念、背景、论证、言外之意），回应读者的疑问",
      feel: "感受：像朋友一样说说读到这里的感受与共鸣，接住读者的情绪和想法",
    },
  },
};

export function buildCommentState(quote: string, comment: string): string {
  return `划线原文：${quote.trim().slice(0, 600)}\n\n读者的评论：${comment.trim().slice(0, 800) || "（没写评论）"}`;
}

/** 返回 null 表示 Jev 没给出可用的判断。 */
export function pickCommentReviewMode(
  answers: Record<string, JevAnswer>,
  minConfidence = 0.4,
): CommentReviewMode | null {
  const answer = answers.review_mode;
  const choice = answer?.choice;
  if (choice !== "explain" && choice !== "feel") return null;
  if (choiceConfidence(answer) < minConfidence) return null;
  return choice;
}

// ---------- JEV 波浪线选句（和 Nova 边注互相独立，可以重叠） ----------

export interface JevSentenceCandidate {
  key: string;
  blockKey: string;
  text: string;
}

export interface JevSentencePick extends JevSentenceCandidate {
  confidence: number;
}

const SENTENCE_MIN_CHARS = 8;
const SENTENCE_MAX_CHARS = 120;
export const SENTENCE_PICK_MAX_OPTIONS = 12;

/** 把这一批正文切成候选句子；尽量每个段落都分到名额，最多 12 句。 */
export function splitCandidateSentences(
  blocks: readonly { blockKey: string; text: string }[],
  maxOptions = SENTENCE_PICK_MAX_OPTIONS,
): JevSentenceCandidate[] {
  const perBlock = blocks.map((block) =>
    block.text
      .split(/(?<=[。！？!?；;…])\s*|\n+/u)
      .map((sentence) => sentence.trim())
      .filter((sentence) => {
        const length = [...sentence].length;
        return length >= SENTENCE_MIN_CHARS && length <= SENTENCE_MAX_CHARS;
      })
      .map((text) => ({ blockKey: block.blockKey, text })),
  );
  const picked: { blockKey: string; text: string }[] = [];
  const seen = new Set<string>();
  // 轮流从每个段落取一句，避免长段落把名额占满。
  for (let round = 0; picked.length < maxOptions; round++) {
    let any = false;
    for (const sentences of perBlock) {
      const sentence = sentences[round];
      if (!sentence) continue;
      any = true;
      if (seen.has(sentence.text)) continue;
      seen.add(sentence.text);
      picked.push(sentence);
      if (picked.length >= maxOptions) break;
    }
    if (!any) break;
  }
  return picked.map((sentence, index) => ({ key: `s${index + 1}`, ...sentence }));
}

export function buildSentencePickQuestion(candidates: readonly JevSentenceCandidate[]): JevQuestion {
  const criteria: Record<string, string> = {};
  for (const candidate of candidates) criteria[candidate.key] = candidate.text;
  criteria.none = "都很普通，没有特别值得划出来的句子";
  return {
    type: "choice",
    instructions:
      "如果一位认真的读者要在这段文字里用波浪线划出最值得回味的一句（精彩的表达、关键论点、伏笔或情感高点），会是哪一句？",
    criteria,
  };
}

const PICK_TOP_MIN = 0.25;
const PICK_SECOND_MIN = 0.2;

/** 取 JEV 最看好的一两句；选了 none 或把握太低就不划。 */
export function pickSentences(
  answer: JevAnswer | undefined,
  candidates: readonly JevSentenceCandidate[],
  maxPicks = 2,
): JevSentencePick[] {
  if (!answer?.choice || candidates.length === 0) return [];
  const byKey = new Map(candidates.map((candidate) => [candidate.key, candidate]));
  const probabilities = answer.probabilities;
  if (!probabilities || Object.keys(probabilities).length === 0) {
    const only = byKey.get(answer.choice);
    return only ? [{ ...only, confidence: 1 }] : [];
  }
  const ranked = Object.entries(probabilities)
    .filter(([key, value]) => byKey.has(key) && Number.isFinite(value))
    .sort((a, b) => b[1] - a[1]);
  const none = probabilities.none ?? 0;
  const result: JevSentencePick[] = [];
  for (const [key, confidence] of ranked) {
    if (result.length >= maxPicks) break;
    const top = result[0]?.confidence;
    if (top === undefined) {
      if (confidence < PICK_TOP_MIN || confidence < none) break;
    } else if (confidence < PICK_SECOND_MIN || confidence < top / 2) {
      break;
    }
    result.push({ ...byKey.get(key)!, confidence });
  }
  return result;
}

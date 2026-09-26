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

export function buildReactionState(quote: string, comment: string): string {
  return `原文：${quote.trim().slice(0, 600)}\n\nNova 的批注：${comment.trim().slice(0, 800)}`;
}

export function pickNovaReaction(answers: Record<string, JevAnswer>, minConfidence = 0.35): NovaReactionOption | null {
  const answer = answers.reaction;
  const option = answer?.choice ? NOVA_REACTION_OPTIONS[answer.choice] : undefined;
  if (!option || choiceConfidence(answer) < minConfidence) return null;
  return option;
}

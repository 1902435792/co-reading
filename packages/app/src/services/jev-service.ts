import { useProviderStore } from "@/store/provider-store";
import { fetch as fetchTauri } from "@tauri-apps/plugin-http";
import { useSyncExternalStore } from "react";
import {
  ANSWER_GRADE_QUESTIONS,
  DEFAULT_JEV_SETTINGS,
  EMOTION_QUESTIONS,
  type JevAnswer,
  type JevPageGate,
  type JevQuestion,
  type JevSentencePick,
  type JevSettings,
  NOTE_WORTH_QUESTIONS,
  NOVA_REACTION_QUESTIONS,
  type NovaReactionOption,
  PAGE_GATE_QUESTIONS,
  PASSAGE_DIFFICULTY_QUESTIONS,
  answerGradeOf,
  buildJevRequest,
  buildPageState,
  buildReactionState,
  buildSentencePickQuestion,
  decidePageGate,
  emotionFromAnswers,
  extractJevAnswers,
  isPassageHard,
  jevEndpointNeedsUrl,
  pickSentences,
  splitCandidateSentences,
  normalizeJevSettings,
  noteWorthOf,
  pickNovaReaction,
  COMMENT_REVIEW_MODE_QUESTIONS,
  type CommentReviewMode,
  buildCommentState,
  pickCommentReviewMode,
} from "./jev-rules";

const SETTINGS_KEY = "deepreader:jev-settings";
const STATS_KEY = "deepreader:jev-stats";
const CHANGE_EVENT = "deepreader:jev-settings-change";
/** Jev 通常 0.1–0.5 秒返回；超过这个时间就放弃，按原来的流程走。 */
const JEV_TIMEOUT_MS = 3_000;

// ---------- 设置 ----------

let cachedRaw: string | null | undefined;
let cachedSettings: JevSettings = DEFAULT_JEV_SETTINGS;

export function getJevSettings(): JevSettings {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(SETTINGS_KEY);
  } catch {
    raw = null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cachedSettings = normalizeJevSettings(raw ? JSON.parse(raw) : null);
    } catch {
      cachedSettings = DEFAULT_JEV_SETTINGS;
    }
  }
  return cachedSettings;
}

export function updateJevSettings(patch: Partial<JevSettings>) {
  const next = normalizeJevSettings({ ...getJevSettings(), ...patch });
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // 存储不可用时忽略。
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useJevSettings(): JevSettings {
  return useSyncExternalStore(subscribe, getJevSettings, () => DEFAULT_JEV_SETTINGS);
}

// ---------- 统计 ----------

export interface JevStats {
  checked: number;
  skipped: number;
  failed: number;
  lastReason: string;
}

export function getJevStats(): JevStats {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STATS_KEY) ?? "{}") as Partial<JevStats>;
    return {
      checked: Number(parsed.checked) || 0,
      skipped: Number(parsed.skipped) || 0,
      failed: Number(parsed.failed) || 0,
      lastReason: typeof parsed.lastReason === "string" ? parsed.lastReason : "",
    };
  } catch {
    return { checked: 0, skipped: 0, failed: 0, lastReason: "" };
  }
}

function bumpJevStats(patch: (stats: JevStats) => JevStats) {
  try {
    window.localStorage.setItem(STATS_KEY, JSON.stringify(patch(getJevStats())));
  } catch {
    // 统计失败不影响共读。
  }
}

export function resetJevStats() {
  try {
    window.localStorage.removeItem(STATS_KEY);
  } catch {
    // ignore
  }
}

// ---------- 请求 ----------

function resolveApiKey(settings: JevSettings): string {
  if (settings.apiKey) return settings.apiKey;
  if (settings.endpoint !== "openrouter") return "";
  const openrouter = useProviderStore.getState().modelProviders.find((provider) => provider.provider === "openrouter");
  return openrouter?.apiKey?.trim() ?? "";
}

export function isJevConfigured(settings: JevSettings = getJevSettings()): boolean {
  if (jevEndpointNeedsUrl(settings.endpoint)) return /^https?:\/\//.test(settings.baseUrl);
  return resolveApiKey(settings).length > 0;
}

export async function requestJevDecisions(
  state: string,
  questions: Record<string, JevQuestion>,
  options: { settings?: JevSettings; signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<Record<string, JevAnswer>> {
  const settings = options.settings ?? getJevSettings();
  const { url, body } = buildJevRequest(settings, state, questions);
  if (!/^https?:\/\//.test(url)) throw new Error("请先填写 Jev 接口地址");
  const apiKey = resolveApiKey(settings);
  if (settings.endpoint === "openrouter" && !apiKey) {
    throw new Error("没有 OpenRouter Key：请在这里填写，或在「模型提供商」里配置 OpenRouter");
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), options.timeoutMs ?? JEV_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const response = await fetchTauri(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // 部分中转服务（Cloudflare）会拦截没有 User-Agent 的请求。
        "User-Agent": "DeepReader/0.3",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      const failure = payload as { error?: { message?: string } | string; message?: string } | null;
      const message =
        (typeof failure?.error === "string" ? failure.error : failure?.error?.message) ?? failure?.message;
      throw new Error(`Jev 请求失败（HTTP ${response.status}）${message ? `：${message}` : ""}`);
    }
    const answers = extractJevAnswers(payload);
    if (!answers) throw new Error("Jev 返回的格式无法识别");
    return answers;
  } finally {
    window.clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
  }
}

/**
 * 共读预筛：返回 null 表示不做判断（未开启、未配置或请求失败），调用方照常请求共读 Agent。
 */
export async function evaluateCoReadingPageWithJev(
  blocks: readonly { text: string; sectionLabel?: string }[],
  signal?: AbortSignal,
): Promise<JevPageGate | null> {
  const settings = getJevSettings();
  if (!settings.prefilter || !isJevConfigured(settings)) return null;
  try {
    const answers = await requestJevDecisions(buildPageState(blocks), PAGE_GATE_QUESTIONS, { settings, signal });
    const gate = decidePageGate(answers, settings.skipLevel);
    bumpJevStats((stats) => ({
      ...stats,
      checked: stats.checked + 1,
      skipped: stats.skipped + (gate.skip ? 1 : 0),
      lastReason: gate.skip ? gate.reason : stats.lastReason,
    }));
    return gate;
  } catch {
    if (!signal?.aborted) bumpJevStats((stats) => ({ ...stats, failed: stats.failed + 1 }));
    return null;
  }
}

export interface JevBatchVerdict {
  /** null 表示没做预筛（没开、没配置或失败），照常请求 Nova。 */
  gate: JevPageGate | null;
  /** JEV 自己挑的波浪线句子，和 Nova 的边注互不影响。 */
  picks: JevSentencePick[];
}

/**
 * 共读一批正文的 JEV 判断：「值不值得批注」和「波浪线选句」合在同一个请求里。
 * 未配置 JEV 或请求失败时返回 { gate: null, picks: [] }，不影响 Nova。
 */
export async function evaluateCoReadingBatchWithJev(
  blocks: readonly { blockKey: string; text: string; sectionLabel?: string }[],
  options: { gate: boolean; wavy: boolean },
  signal?: AbortSignal,
): Promise<JevBatchVerdict> {
  const settings = getJevSettings();
  const empty: JevBatchVerdict = { gate: null, picks: [] };
  if ((!options.gate && !options.wavy) || !isJevConfigured(settings)) return empty;
  const candidates = options.wavy ? splitCandidateSentences(blocks) : [];
  const questions: Record<string, JevQuestion> = options.gate ? { ...PAGE_GATE_QUESTIONS } : {};
  if (candidates.length > 0) questions.wavy_pick = buildSentencePickQuestion(candidates);
  if (Object.keys(questions).length === 0) return empty;
  try {
    const answers = await requestJevDecisions(buildPageState(blocks), questions, { settings, signal });
    const gate = options.gate ? decidePageGate(answers, settings.skipLevel) : null;
    if (gate) {
      bumpJevStats((stats) => ({
        ...stats,
        checked: stats.checked + 1,
        skipped: stats.skipped + (gate.skip ? 1 : 0),
        lastReason: gate.skip ? gate.reason : stats.lastReason,
      }));
    }
    return { gate, picks: pickSentences(answers.wavy_pick, candidates) };
  } catch {
    if (!signal?.aborted) bumpJevStats((stats) => ({ ...stats, failed: stats.failed + 1 }));
    return empty;
  }
}

/** Nova 表情：返回 null 时沿用原来的表情规则。 */
export async function classifyNovaReactionWithJev(quote: string, comment: string): Promise<NovaReactionOption | null> {
  const settings = getJevSettings();
  if (!settings.mood || !comment.trim() || !isJevConfigured(settings)) return null;
  try {
    const answers = await requestJevDecisions(buildReactionState(quote, comment), NOVA_REACTION_QUESTIONS, {
      settings,
    });
    return pickNovaReaction(answers);
  } catch {
    return null;
  }
}

/**
 * 新边注的一次性判断：表情（受「表情」开关控制）和价值分（墨点样式用）合在一个请求里。
 * 两者都不需要、未配置 Jev 或请求失败时返回 null / 对应字段为 null。
 */
export async function judgeAnnotationWithJev(
  quote: string,
  comment: string,
  options: { worth: boolean },
): Promise<{ reaction: NovaReactionOption | null; worth: number | null } | null> {
  const settings = getJevSettings();
  const wantReaction = settings.mood;
  const wantWorth = options.worth;
  if ((!wantReaction && !wantWorth) || !comment.trim() || !isJevConfigured(settings)) return null;
  const questions = {
    ...(wantReaction ? NOVA_REACTION_QUESTIONS : {}),
    ...(wantWorth ? NOTE_WORTH_QUESTIONS : {}),
  };
  try {
    const answers = await requestJevDecisions(buildReactionState(quote, comment), questions, { settings });
    return {
      reaction: wantReaction ? pickNovaReaction(answers) : null,
      worth: wantWorth ? noteWorthOf(answers) : null,
    };
  } catch {
    return null;
  }
}

/**
 * 卡住探头：判断当前页是否难懂。返回 null 表示没法判断（未配置 Jev 或请求失败），调用方自行决定。
 */
export async function judgePassageDifficultyWithJev(text: string): Promise<boolean | null> {
  const settings = getJevSettings();
  if (!text.trim() || !isJevConfigured(settings)) return null;
  try {
    const answers = await requestJevDecisions(buildPageState([{ text }]), PASSAGE_DIFFICULTY_QUESTIONS, { settings });
    return isPassageHard(answers);
  } catch {
    return null;
  }
}

/**
 * 章末卡片：判断读者的回答是否抓住参考答案的主要意思。state 由调用方拼好。
 * 返回 0–1 的把握度，null 表示没法判断。
 */
export async function gradeAnswerWithJev(state: string): Promise<number | null> {
  const settings = getJevSettings();
  if (!state.trim() || !isJevConfigured(settings)) return null;
  try {
    const answers = await requestJevDecisions(state, ANSWER_GRADE_QUESTIONS, { settings, timeoutMs: 8_000 });
    return answerGradeOf(answers);
  } catch {
    return null;
  }
}

/** 情绪曲线：给当前页打情绪分。返回 null 表示没法判断。 */
export async function sampleEmotionWithJev(text: string): Promise<{ valence: number; intensity: number } | null> {
  const settings = getJevSettings();
  if (!text.trim() || !isJevConfigured(settings)) return null;
  try {
    const answers = await requestJevDecisions(buildPageState([{ text }]), EMOTION_QUESTIONS, { settings });
    return emotionFromAnswers(answers);
  } catch {
    return null;
  }
}

/** 设置页的「测试」按钮：用一段示例文字同时测两个功能。 */
export async function testJevConnection(settings: JevSettings): Promise<{
  latencyMs: number;
  gate: JevPageGate;
  reaction: NovaReactionOption | null;
}> {
  const sample =
    "章节：第一章\n\n那天夜里，老人把船推进海里时，才发现自己已经八十四天没有打到鱼了。孩子站在岸边，想说什么，最后只是把手里的咖啡递了过去。";
  const startedAt = performance.now();
  const answers = await requestJevDecisions(
    sample,
    { ...PAGE_GATE_QUESTIONS, ...NOVA_REACTION_QUESTIONS },
    { settings, timeoutMs: 10_000 },
  );
  return {
    latencyMs: Math.round(performance.now() - startedAt),
    gate: decidePageGate(answers, settings.skipLevel),
    reaction: pickNovaReaction(answers, 0),
  };
}

/**
 * 读者评论后，Nova 该解释还是说感受。返回 null 表示没法判断（未配置 Jev 或请求失败），调用方按评论内容自行兜底。
 */
export async function chooseCommentReviewModeWithJev(
  quote: string,
  comment: string,
): Promise<CommentReviewMode | null> {
  const settings = getJevSettings();
  if (!quote.trim() || !isJevConfigured(settings)) return null;
  try {
    const answers = await requestJevDecisions(buildCommentState(quote, comment), COMMENT_REVIEW_MODE_QUESTIONS, {
      settings,
      timeoutMs: 4_000,
    });
    return pickCommentReviewMode(answers);
  } catch {
    return null;
  }
}

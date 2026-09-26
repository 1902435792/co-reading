import { useSyncExternalStore } from "react";

/** Nova 的小功能开关，都不会打断阅读，默认开启。 */
export interface NovaExtras {
  /** 关书时弹出本次阅读小结。 */
  sessionSummary: boolean;
  /** 深夜（23:00–5:00）换困倦表情，偶尔提醒休息。 */
  lateNight: boolean;
  /** 书架书卡上显示 Nova 的一句话。 */
  shelfLines: boolean;
  /** 同一页停留很久时问要不要帮忙（会打扰，默认关闭）。 */
  stuckHint: boolean;
  /** 读完一章时问要不要做章末卡片（会打扰，默认关闭）。 */
  chapterCard: boolean;
  /** 翻页时发现和其他书的联系（提到书架上的书、其他书里记下的概念）就提一句。 */
  crossBook: boolean;
  /** 合书、读完一本书、做完章末卡片时，提议把共读写进 VCP 日记（只提议，不自动写）。 */
  diaryPrompt: boolean;
  /** 用 Jev 给每页打情绪分，画成整本书的情绪曲线（需要配置 Jev）。 */
  emotionCurve: boolean;
  /** AI 边注的画法：下划线，或只在句末画一个小墨点。 */
  aiNoteStyle: "underline" | "ink";
}

export const DEFAULT_NOVA_EXTRAS: NovaExtras = {
  sessionSummary: true,
  lateNight: true,
  shelfLines: true,
  stuckHint: false,
  chapterCard: false,
  crossBook: true,
  diaryPrompt: true,
  emotionCurve: false,
  aiNoteStyle: "underline",
};

const STORAGE_KEY = "deepreader:nova-extras";
const CHANGE_EVENT = "deepreader:nova-extras-change";

type NovaExtrasToggle = { [K in keyof NovaExtras]: NovaExtras[K] extends boolean ? K : never }[keyof NovaExtras];

export function normalizeNovaExtras(value: unknown): NovaExtras {
  const raw = (value && typeof value === "object" ? value : {}) as Partial<Record<keyof NovaExtras, unknown>>;
  const pick = (key: NovaExtrasToggle): boolean =>
    typeof raw[key] === "boolean" ? (raw[key] as boolean) : DEFAULT_NOVA_EXTRAS[key];
  return {
    sessionSummary: pick("sessionSummary"),
    lateNight: pick("lateNight"),
    shelfLines: pick("shelfLines"),
    stuckHint: pick("stuckHint"),
    chapterCard: pick("chapterCard"),
    crossBook: pick("crossBook"),
    diaryPrompt: pick("diaryPrompt"),
    emotionCurve: pick("emotionCurve"),
    aiNoteStyle: raw.aiNoteStyle === "ink" ? "ink" : "underline",
  };
}

// useSyncExternalStore 需要稳定的快照：原始字符串不变时返回同一个对象。
let cache: { raw: string | null; value: NovaExtras } | null = null;

export function getNovaExtras(): NovaExtras {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    raw = null;
  }
  if (cache && cache.raw === raw) return cache.value;
  let parsed: unknown = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }
  cache = { raw, value: normalizeNovaExtras(parsed) };
  return cache.value;
}

export function updateNovaExtras(patch: Partial<NovaExtras>) {
  const next = { ...getNovaExtras(), ...patch };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    cache = { raw: null, value: next };
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

export function useNovaExtras(): NovaExtras {
  return useSyncExternalStore(subscribe, getNovaExtras, () => DEFAULT_NOVA_EXTRAS);
}

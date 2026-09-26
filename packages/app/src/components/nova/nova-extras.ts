import { useSyncExternalStore } from "react";

/** Nova 的小功能开关，都不会打断阅读，默认开启。 */
export interface NovaExtras {
  /** 关书时弹出本次阅读小结。 */
  sessionSummary: boolean;
  /** 深夜（23:00–5:00）换困倦表情，偶尔提醒休息。 */
  lateNight: boolean;
  /** 书架书卡上显示 Nova 的一句话。 */
  shelfLines: boolean;
}

export const DEFAULT_NOVA_EXTRAS: NovaExtras = {
  sessionSummary: true,
  lateNight: true,
  shelfLines: true,
};

const STORAGE_KEY = "deepreader:nova-extras";
const CHANGE_EVENT = "deepreader:nova-extras-change";

export function normalizeNovaExtras(value: unknown): NovaExtras {
  const raw = (value && typeof value === "object" ? value : {}) as Partial<Record<keyof NovaExtras, unknown>>;
  const pick = (key: keyof NovaExtras) =>
    typeof raw[key] === "boolean" ? (raw[key] as boolean) : DEFAULT_NOVA_EXTRAS[key];
  return {
    sessionSummary: pick("sessionSummary"),
    lateNight: pick("lateNight"),
    shelfLines: pick("shelfLines"),
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

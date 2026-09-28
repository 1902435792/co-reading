import { useSyncExternalStore } from "react";

/**
 * 共读触发方式（每台设备各自保存）。
 * - smart 开：本地按段落字数估算「读完」需要的停留时间，快速划过的段落不算读过；
 *   交给 Nova 之前再让 JEV 判断值不值得批注（配置了 JEV 时）。
 * - smart 关：段落在屏幕上停留满 N 秒就算读过，直接交给 Nova。
 * - seconds：上面的 N；智能模式下也表示「停下来多久算停顿」。
 * - wavy：让 JEV 顺带挑一两句划波浪线（需要配置 JEV）。
 * - fast：自动边注用不深度思考的快速模型（VCP Bridge 上去掉 -high）。
 */
export interface CoReadingTriggerSettings {
  smart: boolean;
  seconds: number;
  wavy: boolean;
  fast: boolean;
}

export const TRIGGER_SECONDS_MIN = 1;
export const TRIGGER_SECONDS_MAX = 10;

export const DEFAULT_CO_READING_TRIGGER: CoReadingTriggerSettings = {
  smart: true,
  seconds: 2,
  wavy: true,
  // 默认按选中的模型原样请求（主人选了 -high 就用深度思考版）。
  fast: false,
};

const STORAGE_KEY = "deepreader:co-reading-trigger";
const listeners = new Set<() => void>();
let cached: CoReadingTriggerSettings | null = null;

export function normalizeCoReadingTrigger(value: unknown): CoReadingTriggerSettings {
  const record = (value && typeof value === "object" ? value : {}) as Partial<
    Record<keyof CoReadingTriggerSettings, unknown>
  >;
  return {
    smart:
      typeof record.smart === "boolean" ? record.smart : DEFAULT_CO_READING_TRIGGER.smart,
    seconds:
      typeof record.seconds === "number" && Number.isFinite(record.seconds)
        ? Math.min(TRIGGER_SECONDS_MAX, Math.max(TRIGGER_SECONDS_MIN, Math.round(record.seconds)))
        : DEFAULT_CO_READING_TRIGGER.seconds,
    wavy: typeof record.wavy === "boolean" ? record.wavy : DEFAULT_CO_READING_TRIGGER.wavy,
    fast: typeof record.fast === "boolean" ? record.fast : DEFAULT_CO_READING_TRIGGER.fast,
  };
}

export function getCoReadingTrigger(): CoReadingTriggerSettings {
  if (cached) return cached;
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    cached = normalizeCoReadingTrigger(raw ? JSON.parse(raw) : null);
  } catch {
    cached = { ...DEFAULT_CO_READING_TRIGGER };
  }
  return cached;
}

export function setCoReadingTrigger(patch: Partial<CoReadingTriggerSettings>): void {
  cached = normalizeCoReadingTrigger({ ...getCoReadingTrigger(), ...patch });
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(cached));
  } catch {
    // 存不下也照常生效到本次运行结束。
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCoReadingTrigger(): CoReadingTriggerSettings {
  return useSyncExternalStore(subscribe, getCoReadingTrigger, getCoReadingTrigger);
}

// ---------- 纯规则（有单测） ----------

/** 智能模式下假设的「扫读」速度：每秒约 20 个字。 */
const SMART_CHARS_PER_SECOND = 20;
const SMART_MIN_DWELL_MS = 1_500;
const SMART_MAX_DWELL_MS = 8_000;

export function readableLength(text: string): number {
  const compact = text.replace(/\s+/gu, "");
  // 英文按单词折算：一个单词约等于 2 个汉字的阅读时间（按原文分词，去空白之前）。
  const latinWords = text.match(/[A-Za-z]+/gu) ?? [];
  const latinChars = latinWords.reduce((sum, word) => sum + word.length, 0);
  return compact.length - latinChars + latinWords.length * 2;
}

/** 一个段落要在屏幕上停留多久才算「读过」。 */
export function requiredDwellMs(text: string, smart: boolean, seconds: number): number {
  if (!smart) return Math.max(TRIGGER_SECONDS_MIN, seconds) * 1_000;
  const estimate = (readableLength(text) / SMART_CHARS_PER_SECOND) * 1_000;
  return Math.round(Math.min(SMART_MAX_DWELL_MS, Math.max(SMART_MIN_DWELL_MS, estimate)));
}

/** 停下来多久算「停顿」。 */
export function pauseMsFor(seconds: number): number {
  return Math.min(5_000, Math.max(1_000, seconds * 1_000));
}

/** 攒够这么多字就立刻发一批，不必等停顿。 */
export const QUEUE_DISPATCH_CHARS = 3_000;
/** 队列里最早的段落等了这么久，也立刻发。 */
export const QUEUE_MAX_WAIT_MS = 20_000;

export interface QueueDispatchInput {
  queuedCount: number;
  queuedChars: number;
  maxBlocks: number;
  /** 距离上一次翻页/滑动过去了多久。 */
  idleMs: number;
  /** 停顿多久算「停下来了」。 */
  pauseMs: number;
  oldestWaitMs: number;
}

export function shouldDispatchQueue(input: QueueDispatchInput): boolean {
  if (input.queuedCount <= 0) return false;
  return (
    input.queuedChars >= QUEUE_DISPATCH_CHARS ||
    input.queuedCount >= input.maxBlocks ||
    input.idleMs >= input.pauseMs ||
    input.oldestWaitMs >= QUEUE_MAX_WAIT_MS
  );
}

/** 从队列头部按阅读顺序取一批，受段落数和字数上限约束（至少取一个）。 */
export function takeQueueBatch<T extends { text: string }>(
  queue: readonly T[],
  maxBlocks: number,
  maxChars: number,
): T[] {
  const batch: T[] = [];
  let chars = 0;
  for (const block of queue) {
    if (batch.length >= maxBlocks) break;
    const length = block.text.length;
    if (batch.length > 0 && chars + length > maxChars) break;
    batch.push(block);
    chars += length;
  }
  return batch;
}

/** 按页面焦点分组（保持原顺序）；后端一次只允许持久化同一个焦点。 */
export function groupByFocusKey<T extends { focusKey: string }>(blocks: readonly T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const block of blocks) {
    const group = groups.get(block.focusKey);
    if (group) group.push(block);
    else groups.set(block.focusKey, [block]);
  }
  return [...groups.values()];
}

/** JEV 波浪线选句：作者是 ai、样式是波浪线（Nova 自己的边注是蓝色下划线）。 */
export function isJevPickNote(note: { author?: string | null; style?: string | null }): boolean {
  return note.author === "ai" && note.style === "squiggly";
}

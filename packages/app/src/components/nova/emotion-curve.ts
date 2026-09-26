// 情绪曲线：纯函数，便于 node 测试。

export interface EmotionPoint {
  at: number;
  /** 全书进度 0–1 */
  fraction: number;
  sectionLabel?: string;
  /** -1（低沉）到 1（明亮） */
  valence: number;
  /** 0–1 */
  intensity: number;
}

export const EMOTION_MAX_POINTS = 400;
/** 进度相差小于这个值视为同一处，只保留最新一次。 */
const SAME_PLACE = 0.002;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function valenceFromProbabilities(
  probabilities: Partial<Record<"positive" | "neutral" | "negative", number>>,
): number {
  return clamp((probabilities.positive ?? 0) - (probabilities.negative ?? 0), -1, 1);
}

export function addEmotionPoint(
  points: readonly EmotionPoint[],
  point: EmotionPoint,
  max = EMOTION_MAX_POINTS,
): EmotionPoint[] {
  const next = points.filter((item) => Math.abs(item.fraction - point.fraction) >= SAME_PLACE);
  next.push({ ...point, fraction: clamp(point.fraction, 0, 1), valence: clamp(point.valence, -1, 1) });
  while (next.length > max) {
    let oldest = 0;
    for (let index = 1; index < next.length; index += 1) {
      if ((next[index]?.at ?? 0) < (next[oldest]?.at ?? 0)) oldest = index;
    }
    next.splice(oldest, 1);
  }
  return next.sort((a, b) => a.fraction - b.fraction);
}

/** 以强度加权的滑动平均，窗口为前后各 radius 个点。 */
export function smoothEmotion(points: readonly EmotionPoint[], radius = 2): number[] {
  return points.map((_, index) => {
    let sum = 0;
    let weight = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      const item = points[index + offset];
      if (!item) continue;
      const w = (0.3 + item.intensity) / (1 + Math.abs(offset));
      sum += item.valence * w;
      weight += w;
    }
    return weight > 0 ? Math.round((sum / weight) * 1000) / 1000 : 0;
  });
}

export interface EmotionChart {
  line: string;
  area: string;
  zeroY: number;
  dots: { x: number; y: number; r: number; point: EmotionPoint }[];
}

export function buildEmotionChart(
  points: readonly EmotionPoint[],
  width: number,
  height: number,
  pad = 12,
): EmotionChart {
  const zeroY = height / 2;
  const smooth = smoothEmotion(points);
  const xOf = (fraction: number) => Math.round((pad + fraction * (width - pad * 2)) * 10) / 10;
  const yOf = (valence: number) => Math.round((zeroY - valence * (height / 2 - pad)) * 10) / 10;
  const coords = points.map((point, index) => ({ x: xOf(point.fraction), y: yOf(smooth[index] ?? 0), point }));
  const line = coords.map((item, index) => `${index === 0 ? "M" : "L"}${item.x},${item.y}`).join(" ");
  const first = coords[0];
  const last = coords[coords.length - 1];
  const area = first && last ? `M${first.x},${zeroY} ${line.replace(/^M/, "L")} L${last.x},${zeroY} Z` : "";
  const dots = coords.map((item) => ({ ...item, r: Math.round((2 + item.point.intensity * 3) * 10) / 10 }));
  return { line, area, zeroY, dots };
}

/** 找出最明亮和最低沉的地方（按平滑后的值）。 */
export function emotionExtremes(points: readonly EmotionPoint[]): { brightest?: EmotionPoint; darkest?: EmotionPoint } {
  const smooth = smoothEmotion(points);
  let hi = -1;
  let lo = -1;
  smooth.forEach((value, index) => {
    if (hi < 0 || value > (smooth[hi] ?? 0)) hi = index;
    if (lo < 0 || value < (smooth[lo] ?? 0)) lo = index;
  });
  const brightest = hi >= 0 && (smooth[hi] ?? 0) > 0.1 ? points[hi] : undefined;
  const darkest = lo >= 0 && (smooth[lo] ?? 0) < -0.1 ? points[lo] : undefined;
  return { brightest, darkest };
}

// ---------- 存储（每本书） ----------

const storageKey = (bookId: string) => `deepreader:emotion-curve:${bookId}`;

export function loadEmotionPoints(bookId: string): EmotionPoint[] {
  try {
    const list = JSON.parse(globalThis.localStorage?.getItem(storageKey(bookId)) ?? "[]") as unknown;
    if (!Array.isArray(list)) return [];
    return list.filter(
      (item): item is EmotionPoint =>
        item &&
        typeof item.fraction === "number" &&
        typeof item.valence === "number" &&
        typeof item.intensity === "number",
    );
  } catch {
    return [];
  }
}

export function saveEmotionPoint(bookId: string, point: EmotionPoint): EmotionPoint[] {
  const next = addEmotionPoint(loadEmotionPoints(bookId), point);
  try {
    globalThis.localStorage?.setItem(storageKey(bookId), JSON.stringify(next));
  } catch {
    // 忽略
  }
  return next;
}

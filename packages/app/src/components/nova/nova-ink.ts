/** 墨点边注：AI 边注只在句末画一个小墨点，悬停时再看内容。 */

export interface InkRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

export interface InkDotGeometry {
  cx: number;
  cy: number;
  r: number;
}

/**
 * 墨点放在最后一行文字的末尾（竖排时放在最后一列的下方）。
 * - 跳过段末只有空白或换行的窄矩形（章末最后一句常见），免得墨点落到空白处；
 * - 给了 bounds（批注层的宽高）时，句末贴边放不下就挪到行尾下方，并整体收进边界内，避免被裁掉一半。
 */
export function inkDotGeometry(
  rects: readonly InkRect[],
  vertical: boolean,
  bounds?: { width: number; height: number },
): InkDotGeometry | null {
  const list = rects.filter((rect) => rect.width > 0 && rect.height > 0);
  const solid = list.filter((rect) => (vertical ? rect.height : rect.width) >= 3);
  const pool = solid.length > 0 ? solid : list;
  const last = pool[pool.length - 1];
  if (!last) return null;
  const size = vertical ? last.width : last.height;
  const r = Math.round(Math.max(2.5, Math.min(4.5, size * 0.18)) * 10) / 10;
  let geometry = vertical
    ? { cx: last.left + last.width / 2, cy: last.bottom + r + 2, r }
    : { cx: last.right + r + 2, cy: last.top + last.height / 2, r };
  if (bounds && bounds.width > 0 && bounds.height > 0) {
    const pad = Math.ceil(r * 1.9) + 1; // 光晕半径
    if (!vertical && geometry.cx + pad > bounds.width) {
      geometry = { cx: last.right - r, cy: last.bottom + r + 2, r };
    } else if (vertical && geometry.cy + pad > bounds.height) {
      geometry = { cx: last.left - r - 2, cy: last.bottom - r, r };
    }
    const clamp = (value: number, max: number) => Math.min(Math.max(value, pad), Math.max(pad, max - pad));
    geometry = { cx: clamp(geometry.cx, bounds.width), cy: clamp(geometry.cy, bounds.height), r };
  }
  return geometry;
}

/**
 * 墨点深浅：有 Jev 给的价值分（0–1）时按价值分，越有洞见越深；
 * 没有时退回按想法长短估计。
 */
export function inkStrength(comment: string | null | undefined, worth?: number | null): number {
  if (typeof worth === "number" && Number.isFinite(worth)) {
    const value = 0.4 + Math.min(1, Math.max(0, worth)) * 0.55;
    return Math.round(value * 100) / 100;
  }
  const length = comment?.trim().length ?? 0;
  const value = 0.45 + ((length - 30) / 190) * 0.5;
  return Math.round(Math.min(0.95, Math.max(0.45, value)) * 100) / 100;
}

// ---------- 边注价值分（本地缓存） ----------

export const NOTE_WORTH_KEY = "deepreader:ai-note-worth";
export const NOTE_WORTH_EVENT = "deepreader:ai-note-worth-change";
export const NOTE_WORTH_LIMIT = 2_000;

/** 写入一条价值分，超过上限时丢掉最早写入的。纯函数，便于测试。 */
export function rememberNoteWorth(
  map: Record<string, number>,
  id: string,
  worth: number,
  limit = NOTE_WORTH_LIMIT,
): Record<string, number> {
  const next = { ...map };
  delete next[id];
  next[id] = Math.round(Math.min(1, Math.max(0, worth)) * 1000) / 1000;
  const keys = Object.keys(next);
  for (const key of keys.slice(0, Math.max(0, keys.length - limit))) delete next[key];
  return next;
}

function readNoteWorthMap(): Record<string, number> {
  try {
    const raw = globalThis.localStorage?.getItem(NOTE_WORTH_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function getNoteWorth(id: string | undefined): number | null {
  if (!id) return null;
  const value = readNoteWorthMap()[id];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** 保存价值分并广播，墨点样式下批注层会据此重画这条边注。 */
export function saveNoteWorth(id: string, worth: number): void {
  try {
    globalThis.localStorage?.setItem(NOTE_WORTH_KEY, JSON.stringify(rememberNoteWorth(readNoteWorthMap(), id, worth)));
  } catch {
    return;
  }
  globalThis.dispatchEvent?.(new CustomEvent(NOTE_WORTH_EVENT, { detail: { id } }));
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** foliate Overlayer 的自定义画法：draw(rects, options) 返回一个 SVG 元素。 */
export function drawInkDot(
  rects: ArrayLike<InkRect>,
  options: {
    color?: string;
    strength?: number;
    vertical?: boolean;
    bounds?: { width: number; height: number };
  } = {},
): SVGElement {
  const group = document.createElementNS(SVG_NS, "g");
  const geometry = inkDotGeometry(Array.from(rects), Boolean(options.vertical), options.bounds);
  if (!geometry) return group;
  const color = options.color || "#3b82f6";
  const halo = document.createElementNS(SVG_NS, "circle");
  halo.setAttribute("cx", String(geometry.cx));
  halo.setAttribute("cy", String(geometry.cy));
  halo.setAttribute("r", String(geometry.r * 1.9));
  halo.setAttribute("fill", color);
  halo.setAttribute("opacity", String((options.strength ?? 0.7) * 0.18));
  const dot = document.createElementNS(SVG_NS, "circle");
  dot.setAttribute("cx", String(geometry.cx));
  dot.setAttribute("cy", String(geometry.cy));
  dot.setAttribute("r", String(geometry.r));
  dot.setAttribute("fill", color);
  dot.setAttribute("opacity", String(options.strength ?? 0.7));
  group.append(halo, dot);
  return group;
}

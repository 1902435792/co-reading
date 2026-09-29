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

/** 句末是不是标点（。！？」等）：标点只占字格的一角，墨点可以点在字格里空着的那一角。 */
export function endsWithPunctuation(text: string | null | undefined): boolean {
  const tail = (text ?? "").trimEnd().slice(-1);
  return /[。，、；：！？…—”’」』）》〉】〕.,;:!?'")\]]/.test(tail);
}

/**
 * 墨点位置：落在句子最后一个字的字格里，像朱笔在句末点一下。
 * - 横排：句末是标点时点在这个字格的右上角（标点只占左下角，那里是空的）；
 *   不是标点时点在这个字右上方的行间空白里。都不会越过右边，压到下一个字。
 * - 竖排：点在最后一个字格的左下角。
 * - 跳过段末只有空白或换行的窄矩形（章末最后一句常见），免得墨点落到空白处；
 * - 给了 bounds（批注层的宽高）时整体收进边界内，避免被裁掉一半。
 */
export function inkDotGeometry(
  rects: readonly InkRect[],
  vertical: boolean,
  bounds?: { width: number; height: number },
  tailIsPunctuation = true,
): InkDotGeometry | null {
  const list = rects.filter((rect) => rect.width > 0 && rect.height > 0);
  const solid = list.filter((rect) => (vertical ? rect.height : rect.width) >= 3);
  const pool = solid.length > 0 ? solid : list;
  const last = pool[pool.length - 1];
  if (!last) return null;
  const size = vertical ? last.width : last.height;
  const r = Math.round(Math.max(2.2, Math.min(3.4, size * 0.13)) * 10) / 10;
  const inset = Math.round(Math.max(1, size * 0.08) * 10) / 10;
  let geometry: InkDotGeometry;
  if (vertical) {
    geometry = { cx: last.left + r + inset, cy: last.bottom - r - inset, r };
  } else if (tailIsPunctuation) {
    geometry = { cx: last.right - r - inset, cy: last.top + r + inset, r };
  } else {
    geometry = { cx: last.right - r - inset, cy: last.top - r * 0.35, r };
  }
  if (bounds && bounds.width > 0 && bounds.height > 0) {
    const pad = Math.ceil(r * 1.8) + 1; // 柔光半径
    const clamp = (value: number, max: number) => Math.min(Math.max(value, pad), Math.max(pad, max - pad));
    geometry = { cx: clamp(geometry.cx, bounds.width), cy: clamp(geometry.cy, bounds.height), r };
  }
  return geometry;
}

/** 手指点在墨点附近多远以内算点中（CSS 像素）。再远就当普通点屏幕（翻页 / 呼出菜单）。 */
export const INK_TAP_RADIUS = 22;

/** 墨点颜色：朱砂色，夜间调亮一点。 */
export function inkColor(dark: boolean): string {
  return dark ? "#ef8f74" : "#c2412b";
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
    /** 句末是不是标点（决定墨点点在字格里还是行间） */
    tailIsPunctuation?: boolean;
    /** 这条边注下有评论区对话时，外面加一圈细环 */
    threaded?: boolean;
  } = {},
): SVGElement {
  const group = document.createElementNS(SVG_NS, "g");
  const geometry = inkDotGeometry(
    Array.from(rects),
    Boolean(options.vertical),
    options.bounds,
    options.tailIsPunctuation ?? true,
  );
  if (!geometry) return group;
  const color = options.color || inkColor(false);
  const strength = options.strength ?? 0.7;
  const circle = (r: number, attrs: Record<string, string>) => {
    const el = document.createElementNS(SVG_NS, "circle");
    el.setAttribute("cx", String(geometry.cx));
    el.setAttribute("cy", String(geometry.cy));
    el.setAttribute("r", String(r));
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
    return el;
  };
  // 一圈很淡的洇墨，再点一个实心墨点；越有洞见墨色越深
  group.append(
    circle(geometry.r * 1.8, { fill: color, opacity: String(Math.round(strength * 0.16 * 100) / 100) }),
    circle(geometry.r, { fill: color, opacity: String(Math.round((0.5 + strength * 0.5) * 100) / 100) }),
  );
  if (options.threaded) {
    group.append(
      circle(geometry.r * 2.3, { fill: "none", stroke: color, "stroke-width": "0.9", opacity: "0.5" }),
    );
  }
  return group;
}

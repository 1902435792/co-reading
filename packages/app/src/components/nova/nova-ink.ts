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

/** 墨点放在最后一行文字的末尾（竖排时放在最后一列的下方）。 */
export function inkDotGeometry(rects: readonly InkRect[], vertical: boolean): InkDotGeometry | null {
  const list = rects.filter((rect) => rect.width > 0 && rect.height > 0);
  const last = list[list.length - 1];
  if (!last) return null;
  const size = vertical ? last.width : last.height;
  const r = Math.round(Math.max(2.5, Math.min(4.5, size * 0.18)) * 10) / 10;
  return vertical
    ? { cx: last.left + last.width / 2, cy: last.bottom + r + 2, r }
    : { cx: last.right + r + 2, cy: last.top + last.height / 2, r };
}

/** 想法越长，墨点越深。 */
export function inkStrength(comment: string | null | undefined): number {
  const length = comment?.trim().length ?? 0;
  const value = 0.45 + ((length - 30) / 190) * 0.5;
  return Math.round(Math.min(0.95, Math.max(0.45, value)) * 100) / 100;
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** foliate Overlayer 的自定义画法：draw(rects, options) 返回一个 SVG 元素。 */
export function drawInkDot(
  rects: ArrayLike<InkRect>,
  options: { color?: string; strength?: number; vertical?: boolean } = {},
): SVGElement {
  const group = document.createElementNS(SVG_NS, "g");
  const geometry = inkDotGeometry(Array.from(rects), Boolean(options.vertical));
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

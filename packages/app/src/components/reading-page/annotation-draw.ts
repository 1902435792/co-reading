import type { UnderlineStyle } from "@/lib/reading-page";

/** 更轻的标注绘制：细线、圆头、半透明；高亮带圆角和正片叠底。 */

const SVG_NS = "http://www.w3.org/2000/svg";

interface DrawRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

function wavePath(start: number, end: number, base: number, amplitude: number, wavelength: number, vertical: boolean) {
  const length = end - start;
  if (length <= 0) return "";
  const n = Math.max(1, Math.round(length / wavelength));
  const step = length / n;
  const pt = (along: number, across: number) => (vertical ? `${across} ${along}` : `${along} ${across}`);
  let d = `M${pt(start, base)}`;
  for (let i = 0; i < n; i += 1) {
    const a = start + i * step;
    d += ` Q${pt(a + step / 4, base - amplitude)} ${pt(a + step / 2, base)}`;
    d += ` Q${pt(a + (3 * step) / 4, base + amplitude)} ${pt(a + step, base)}`;
  }
  return d;
}

export function drawSoftUnderline(
  rects: ArrayLike<DrawRect>,
  options: {
    color?: string;
    style?: UnderlineStyle;
    width?: number;
    vertical?: boolean;
    opacity?: number;
  } = {},
): SVGElement {
  const { color = "#60a5fa", style = "straight", width = 1.25, vertical = false, opacity = 0.62 } = options;
  const g = document.createElementNS(SVG_NS, "g");
  g.setAttribute("fill", "none");
  g.setAttribute("stroke", color);
  g.setAttribute("stroke-width", String(width));
  g.setAttribute("stroke-linecap", "round");
  g.setAttribute("opacity", String(opacity));
  if (style === "dotted") g.setAttribute("stroke-dasharray", `0 ${(width * 2.8).toFixed(2)}`);
  if (style === "dashed") g.setAttribute("stroke-dasharray", `${(width * 4).toFixed(2)} ${(width * 3).toFixed(2)}`);
  if (style === "dotted") g.setAttribute("stroke-width", String(width * 1.6));
  const offset = width + 1;
  for (const rect of Array.from(rects)) {
    if ((vertical ? rect.height : rect.width) < 2) continue;
    const path = document.createElementNS(SVG_NS, "path");
    const inset = width;
    if (vertical) {
      const x = rect.right + offset - 1;
      path.setAttribute(
        "d",
        style === "wavy"
          ? wavePath(rect.top + inset, rect.bottom - inset, x, width * 1.3, width * 5 + 4, true)
          : `M${x} ${rect.top + inset} L${x} ${rect.bottom - inset}`,
      );
    } else {
      const y = rect.bottom + offset - 1;
      path.setAttribute(
        "d",
        style === "wavy"
          ? wavePath(rect.left + inset, rect.right - inset, y, width * 1.3, width * 5 + 4, false)
          : `M${rect.left + inset} ${y} L${rect.right - inset} ${y}`,
      );
    }
    g.append(path);
  }
  return g;
}

export function drawSoftHighlight(
  rects: ArrayLike<DrawRect>,
  options: { color?: string; opacity?: number; dark?: boolean } = {},
): SVGElement {
  const { color = "#facc15", opacity = 0.2, dark = false } = options;
  const g = document.createElementNS(SVG_NS, "g");
  g.setAttribute("fill", color);
  g.style.opacity = String(opacity);
  g.style.mixBlendMode = dark ? "screen" : "multiply";
  for (const rect of Array.from(rects)) {
    if (rect.width < 1 || rect.height < 1) continue;
    const el = document.createElementNS(SVG_NS, "rect");
    el.setAttribute("x", String(rect.left - 1));
    el.setAttribute("y", String(rect.top));
    el.setAttribute("width", String(rect.width + 2));
    el.setAttribute("height", String(rect.height));
    el.setAttribute("rx", "3");
    g.append(el);
  }
  return g;
}

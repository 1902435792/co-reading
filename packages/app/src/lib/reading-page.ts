/**
 * 阅读页面外观：背景（含仿纸质纹理）、标注样式偏好。
 * 纯函数 + localStorage；只用相对导入，方便 node 测试。
 */

// ---------- 阅读背景 ----------

export interface ReadingTexture {
  /** 噪点强度（alpha 系数） */
  alpha: number;
  /** 噪点频率，越大越细 */
  freq: number;
  /** 纹理颜色 0–1 */
  tint: [number, number, number];
}

export interface ReadingBackground {
  id: string;
  name: string;
  bg: string;
  fg: string;
  texture?: ReadingTexture;
  /** 四周微微压暗，像旧纸 */
  vignette?: boolean;
  dark?: boolean;
}

export const READING_BACKGROUNDS: readonly ReadingBackground[] = [
  { id: "default", name: "跟随主题", bg: "", fg: "" },
  { id: "warm-yellow", name: "护眼黄", bg: "#FAF9DE", fg: "#333333" },
  {
    id: "eye-green",
    name: "护眼绿",
    bg: "#E3EDCD",
    fg: "#2F3A26",
    texture: { alpha: 0.05, freq: 0.9, tint: [0.2, 0.3, 0.15] },
  },
  { id: "warm-beige", name: "暖米色", bg: "#FFF2E2", fg: "#333333" },
  {
    id: "xuan",
    name: "宣纸",
    bg: "#F6F1E4",
    fg: "#2E2A24",
    texture: { alpha: 0.07, freq: 0.85, tint: [0.35, 0.3, 0.2] },
  },
  {
    id: "kraft",
    name: "牛皮纸",
    bg: "#E8D9BC",
    fg: "#3A2F22",
    texture: { alpha: 0.1, freq: 0.65, tint: [0.35, 0.25, 0.12] },
  },
  {
    id: "parchment",
    name: "羊皮卷",
    bg: "#F1E3C2",
    fg: "#4A3A28",
    texture: { alpha: 0.08, freq: 0.55, tint: [0.4, 0.28, 0.12] },
    vignette: true,
  },
  { id: "warm-gray", name: "暖灰", bg: "#EAEAEA", fg: "#333333" },
  { id: "dark-gray", name: "夜间灰", bg: "#2B2B2B", fg: "#CCCCCC", dark: true },
  {
    id: "ink-night",
    name: "墨夜",
    bg: "#1F1E1C",
    fg: "#CFC6B6",
    texture: { alpha: 0.06, freq: 0.8, tint: [0.9, 0.85, 0.75] },
    dark: true,
  },
];

const BG_MARK = /\/\*deepreader-bg:\S+\*\/[\s\S]*?\/\*\/deepreader-bg\*\//g;

export function textureImage(texture: ReadingTexture): string {
  const [r, g, b] = texture.tint;
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${texture.freq}' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} 0 0 0 ${texture.alpha * 6} 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** 背景的 CSS 片段（不含标记），也用于设置里的色块预览。 */
export function backgroundLayers(preset: ReadingBackground): { image: string; size: string } | null {
  if (!preset.texture && !preset.vignette) return null;
  const images: string[] = [];
  const sizes: string[] = [];
  if (preset.texture) {
    images.push(textureImage(preset.texture));
    sizes.push("220px 220px");
  }
  if (preset.vignette) {
    images.push("radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(80,50,10,0.10) 100%)");
    sizes.push("100% 100%");
  }
  return { image: images.join(", "), size: sizes.join(", ") };
}

export function buildReadingBgCss(preset: ReadingBackground): string {
  if (preset.id === "default" || !preset.bg) return "";
  const layers = backgroundLayers(preset);
  const image = layers
    ? `background-image:${layers.image}!important;background-size:${layers.size}!important;background-repeat:repeat!important;`
    : "background-image:none!important;";
  return `/*deepreader-bg:${preset.id}*/ html,body{background-color:${preset.bg}!important;color:${preset.fg}!important;${image}} /*/deepreader-bg*/`;
}

export function getReadingBgId(stylesheet: string | undefined): string {
  const match = (stylesheet || "").match(/\/\*deepreader-bg:(\S+)\*\//);
  return match ? match[1] : "default";
}

/** 替换用户样式表里的背景片段，保留其他自定义样式。 */
export function applyReadingBg(stylesheet: string | undefined, bgId: string): string {
  const preset = READING_BACKGROUNDS.find((item) => item.id === bgId) ?? READING_BACKGROUNDS[0];
  const rest = (stylesheet || "").replace(BG_MARK, "").trim();
  return `${rest}\n${buildReadingBgCss(preset)}`.trim();
}

// ---------- 标注样式 ----------

export type UnderlineStyle = "straight" | "wavy" | "dotted" | "dashed";
export type UnderlineWeight = "thin" | "regular";
export type HighlightStrength = "soft" | "medium" | "strong";
export type AnnotationPalette = "soft" | "vivid";

export interface AnnotationPrefs {
  underlineStyle: UnderlineStyle;
  underlineWeight: UnderlineWeight;
  highlightStrength: HighlightStrength;
  palette: AnnotationPalette;
  /** 在书页上隐藏所有划线、高亮和 Nova 墨点（数据不删，书评区照常能看）。所有书通用。 */
  hideOnPage: boolean;
}

export const DEFAULT_ANNOTATION_PREFS: AnnotationPrefs = {
  underlineStyle: "straight",
  underlineWeight: "thin",
  highlightStrength: "soft",
  palette: "soft",
  hideOnPage: false,
};

export const UNDERLINE_STYLE_LABELS: Record<UnderlineStyle, string> = {
  straight: "直线",
  wavy: "波浪",
  dotted: "点线",
  dashed: "虚线",
};
export const UNDERLINE_WEIGHT_LABELS: Record<UnderlineWeight, string> = { thin: "细", regular: "中" };
export const HIGHLIGHT_STRENGTH_LABELS: Record<HighlightStrength, string> = { soft: "淡", medium: "中", strong: "浓" };
export const PALETTE_LABELS: Record<AnnotationPalette, string> = { soft: "柔和", vivid: "鲜艳" };

export const UNDERLINE_WIDTH: Record<UnderlineWeight, number> = { thin: 1.25, regular: 2 };
export const HIGHLIGHT_OPACITY: Record<HighlightStrength, number> = { soft: 0.2, medium: 0.3, strong: 0.42 };

export const SOFT_PALETTE: Record<string, string> = {
  red: "#e8a0a0",
  yellow: "#f0d36b",
  green: "#93d3a2",
  blue: "#94bdf0",
  violet: "#bfa9ef",
};

export function resolveAnnotationColor(
  color: string | undefined,
  prefs: AnnotationPrefs,
  vivid: Record<string, string>,
): string | undefined {
  if (!color) return color;
  const table = prefs.palette === "soft" ? SOFT_PALETTE : vivid;
  return table[color] ?? vivid[color] ?? color;
}

function pick<T extends string>(value: unknown, allowed: Record<T, unknown>, fallback: T): T {
  return typeof value === "string" && value in allowed ? (value as T) : fallback;
}

export function parseAnnotationPrefs(raw: string | null): AnnotationPrefs {
  let data: Record<string, unknown> = {};
  try {
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    if (parsed && typeof parsed === "object") data = parsed as Record<string, unknown>;
  } catch {
    data = {};
  }
  const d = DEFAULT_ANNOTATION_PREFS;
  return {
    underlineStyle: pick(data.underlineStyle, UNDERLINE_STYLE_LABELS, d.underlineStyle),
    underlineWeight: pick(data.underlineWeight, UNDERLINE_WEIGHT_LABELS, d.underlineWeight),
    highlightStrength: pick(data.highlightStrength, HIGHLIGHT_STRENGTH_LABELS, d.highlightStrength),
    palette: pick(data.palette, PALETTE_LABELS, d.palette),
    hideOnPage: data.hideOnPage === true,
  };
}

export const ANNOTATION_PREFS_KEY = "deepreader:annotation-prefs";
export const ANNOTATION_PREFS_EVENT = "deepreader:annotation-prefs-change";

export function getAnnotationPrefs(): AnnotationPrefs {
  try {
    return parseAnnotationPrefs(
      typeof window !== "undefined" ? window.localStorage.getItem(ANNOTATION_PREFS_KEY) : null,
    );
  } catch {
    return { ...DEFAULT_ANNOTATION_PREFS };
  }
}

export function setAnnotationPrefs(patch: Partial<AnnotationPrefs>): AnnotationPrefs {
  const next = { ...getAnnotationPrefs(), ...patch };
  try {
    window.localStorage.setItem(ANNOTATION_PREFS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  window.dispatchEvent(new CustomEvent(ANNOTATION_PREFS_EVENT, { detail: next }));
  return next;
}

// ---------- 排版范围 ----------

export const LAYOUT_RANGES = {
  lineHeight: { min: 1.2, max: 2.6, step: 0.1, label: "行距" },
  paragraphMargin: { min: 0, max: 2.5, step: 0.25, label: "段距" },
  readingWidth: { min: 0, max: 1400, step: 20, label: "页宽" },
  gapPercent: { min: 0, max: 20, step: 1, label: "页边距" },
  textIndent: { min: 0, max: 4, step: 0.5, label: "首行缩进" },
  letterSpacing: { min: 0, max: 4, step: 0.25, label: "字间距" },
} as const;

export type LayoutKey = keyof typeof LAYOUT_RANGES;

export function formatLayoutValue(key: LayoutKey, value: number): string {
  switch (key) {
    case "lineHeight":
      return value.toFixed(1);
    case "paragraphMargin":
    case "textIndent":
      return `${value}em`;
    case "readingWidth":
      return value <= 0 ? "自动" : `${value}px`;
    case "gapPercent":
      return `${value}%`;
    case "letterSpacing":
      return `${value}px`;
  }
}

export function clampLayoutValue(key: LayoutKey, value: number): number {
  const range = LAYOUT_RANGES[key];
  if (!Number.isFinite(value)) return range.min;
  const snapped = Math.round(value / range.step) * range.step;
  return Math.min(range.max, Math.max(range.min, Number(snapped.toFixed(2))));
}

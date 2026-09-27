import tinycolor from "tinycolor2";
import { getContrastOklch, hexToOklch } from "../utils/color";
import { stubTranslation as _ } from "../utils/misc";

export type BaseColor = {
  bg: string;
  fg: string;
  primary: string;
};

export type ThemeMode = "auto" | "light" | "dark";

export type Palette = {
  "base-100": string;
  "base-200": string;
  "base-300": string;
  "base-content": string;
  neutral: string;
  "neutral-content": string;
  primary: string;
  secondary: string;
  accent: string;
};

export type Theme = {
  name: string;
  label: string;
  colors: {
    light: Palette;
    dark: Palette;
  };
  isCustomizale?: boolean;
};

export type CustomTheme = {
  name: string;
  label: string;
  colors: {
    light: BaseColor;
    dark: BaseColor;
  };
};

export const generateLightPalette = ({ bg, fg, primary }: BaseColor) => {
  return {
    "base-100": bg, // Main background
    "base-200": tinycolor(bg).darken(5).toHexString(), // Slightly darker
    "base-300": tinycolor(bg).darken(12).toHexString(), // More darker
    "base-content": fg, // Main text color
    neutral: tinycolor(bg).darken(15).desaturate(20).toHexString(), // Muted neutral
    "neutral-content": tinycolor(fg).lighten(20).desaturate(20).toHexString(), // Slightly lighter text
    primary: primary,
    secondary: tinycolor(primary).lighten(20).toHexString(), // Lighter secondary
    accent: tinycolor(primary).analogous()[1]!.toHexString(), // Analogous accent
  } as Palette;
};

export const generateDarkPalette = ({ bg, fg, primary }: BaseColor) => {
  return {
    "base-100": bg, // Main background
    "base-200": tinycolor(bg).lighten(5).toHexString(), // Slightly lighter
    "base-300": tinycolor(bg).lighten(12).toHexString(), // More lighter
    "base-content": fg, // Main text color
    neutral: tinycolor(bg).lighten(15).desaturate(20).toHexString(), // Muted neutral
    "neutral-content": tinycolor(fg).darken(20).desaturate(20).toHexString(), // Darkened text
    primary: primary,
    secondary: tinycolor(primary).darken(20).toHexString(), // Darker secondary
    accent: tinycolor(primary).triad()[1]!.toHexString(), // Triad accent
  } as Palette;
};

export const themes = [
  {
    name: "default",
    label: _("Default"),
    colors: {
      light: generateLightPalette({ fg: "#171717", bg: "#ffffff", primary: "#0066cc" }),
      dark: generateDarkPalette({ fg: "#e0e0e0", bg: "#222222", primary: "#77bbee" }),
    },
  },
  {
    name: "eyecare",
    label: _("Eye Care"),
    colors: {
      light: generateLightPalette({ fg: "#3b342b", bg: "#f4efe3", primary: "#4f7a6a" }),
      dark: generateDarkPalette({ fg: "#dcd3c1", bg: "#23211e", primary: "#9cc3b0" }),
    },
  },
  {
    name: "paper",
    label: _("Paper"),
    colors: {
      light: generateLightPalette({ fg: "#1f1d1a", bg: "#f7f3ea", primary: "#8a5a2b" }),
      dark: generateDarkPalette({ fg: "#e3dacb", bg: "#1e1c19", primary: "#d0a370" }),
    },
  },
  {
    name: "bamboo",
    label: _("Bamboo"),
    colors: {
      light: generateLightPalette({ fg: "#2f3a2c", bg: "#eaf2e6", primary: "#3f7d4e" }),
      dark: generateDarkPalette({ fg: "#d5e0d2", bg: "#1d2320", primary: "#8cc79b" }),
    },
  },
  {
    name: "gray",
    label: _("Gray"),
    colors: {
      light: generateLightPalette({ fg: "#222222", bg: "#e0e0e0", primary: "#4488cc" }),
      dark: generateDarkPalette({ fg: "#c6c6c6", bg: "#444444", primary: "#88ccee" }),
    },
  },
  {
    name: "sepia",
    label: _("Sepia"),
    colors: {
      light: generateLightPalette({ fg: "#5b4636", bg: "#f1e8d0", primary: "#008b8b" }),
      dark: generateDarkPalette({ fg: "#ffd595", bg: "#342e25", primary: "#48d1cc" }),
    },
  },
  {
    name: "grass",
    label: _("Grass"),
    colors: {
      light: generateLightPalette({ fg: "#232c16", bg: "#d7dbbd", primary: "#177b4d" }),
      dark: generateDarkPalette({ fg: "#d8deba", bg: "#333627", primary: "#a6d608" }),
    },
  },
  {
    name: "cherry",
    label: _("Cherry"),
    colors: {
      light: generateLightPalette({ fg: "#4e1609", bg: "#f0d1d5", primary: "#de3838" }),
      dark: generateDarkPalette({ fg: "#e5c4c8", bg: "#462f32", primary: "#ff646e" }),
    },
  },
  {
    name: "sky",
    label: _("Sky"),
    colors: {
      light: generateLightPalette({ fg: "#262d48", bg: "#cedef5", primary: "#2d53e5" }),
      dark: generateDarkPalette({ fg: "#babee1", bg: "#282e47", primary: "#ff646e" }),
    },
  },
  {
    name: "solarized",
    label: _("Solarized"),
    colors: {
      light: generateLightPalette({ fg: "#586e75", bg: "#fdf6e3", primary: "#268bd2" }),
      dark: generateDarkPalette({ fg: "#93a1a1", bg: "#002b36", primary: "#268bd2" }),
    },
  },
  {
    name: "gruvbox",
    label: _("Gruvbox"),
    colors: {
      light: generateLightPalette({ fg: "#3c3836", bg: "#fbf1c7", primary: "#076678" }),
      dark: generateDarkPalette({ fg: "#ebdbb2", bg: "#282828", primary: "#83a598" }),
    },
  },
  {
    name: "nord",
    label: _("Nord"),
    colors: {
      light: generateLightPalette({ fg: "#2e3440", bg: "#eceff4", primary: "#5e81ac" }),
      dark: generateDarkPalette({ fg: "#d8dee9", bg: "#2e3440", primary: "#88c0d0" }),
    },
  },
  {
    name: "contrast",
    label: _("Contrast"),
    colors: {
      light: generateLightPalette({ fg: "#000000", bg: "#ffffff", primary: "#4488cc" }),
      dark: generateDarkPalette({ fg: "#ffffff", bg: "#000000", primary: "#88ccee" }),
    },
  },
  {
    name: "sunset",
    label: _("Sunset"),
    colors: {
      light: generateLightPalette({ fg: "#423126", bg: "#fff7f0", primary: "#fe6b64" }),
      dark: generateDarkPalette({ fg: "#f6e1d7", bg: "#3c2b25", primary: "#ff9c94" }),
    },
  },
] as Theme[];

const generateCustomThemeVariables = (palette: Palette): string => {
  return `
    --b1: ${hexToOklch(palette["base-100"])};
    --b2: ${hexToOklch(palette["base-200"])};
    --b3: ${hexToOklch(palette["base-300"])};
    --bc: ${hexToOklch(palette["base-content"])};
    
    --p: ${hexToOklch(palette.primary)};
    --pc: ${getContrastOklch(palette.primary)};
    
    --s: ${hexToOklch(palette.secondary)};
    --sc: ${getContrastOklch(palette.secondary)};
    
    --a: ${hexToOklch(palette.accent)};
    --ac: ${getContrastOklch(palette.accent)};
    
    --n: ${hexToOklch(palette.neutral)};
    --nc: ${hexToOklch(palette["neutral-content"])};
    
    --in: 69.37% 0.047 231;
    --inc: 100% 0 0;
    --su: 78.15% 0.12 160;
    --suc: 100% 0 0;
    --wa: 90.69% 0.123 84;
    --wac: 0% 0 0;
    --er: 70.9% 0.184 22;
    --erc: 100% 0 0;
  `;
};

export const applyCustomTheme = (customTheme: CustomTheme) => {
  const lightPalette = generateLightPalette(customTheme.colors.light);
  const darkPalette = generateDarkPalette(customTheme.colors.dark);

  const lightThemeName = `${customTheme.name}-light`;
  const darkThemeName = `${customTheme.name}-dark`;

  const css = `
    [data-theme="${lightThemeName}"] {
      ${generateCustomThemeVariables(lightPalette)}
    }
    
    [data-theme="${darkThemeName}"] {
      ${generateCustomThemeVariables(darkPalette)}
    }
    
    :root {
      --${lightThemeName}: 1;
      --${darkThemeName}: 1;
    }
  `;

  const styleElement = document.createElement("style");
  styleElement.id = `theme-${lightThemeName}-styles`;
  styleElement.textContent = css;

  const existingStyle = document.getElementById(styleElement.id);
  if (existingStyle) {
    existingStyle.remove();
  }

  document.head.appendChild(styleElement);

  return {
    light: lightThemeName,
    dark: darkThemeName,
  };
};

/** 主题色的中文名（设置页展示用）。 */
export const THEME_LABELS_ZH: Record<string, string> = {
  default: "默认",
  eyecare: "护眼",
  paper: "纸墨",
  bamboo: "青竹",
  gray: "灰调",
  sepia: "复古",
  grass: "草地",
  cherry: "樱桃",
  sky: "晴空",
  solarized: "Solarized",
  gruvbox: "Gruvbox",
  nord: "Nord",
  contrast: "高对比",
  sunset: "日落",
};

/** 这些主题色会连同整个应用界面一起换色（其余只影响阅读页）。 */
export const APP_WIDE_THEMES = ["eyecare", "paper", "bamboo", "sepia"] as const;

/**
 * 由主题色板推导整套界面变量（背景、卡片、侧栏、边框等），让没有手调 CSS 的主题也能整个界面换色。
 * 手调过的主题（APP_WIDE_THEMES）在 app-themes.css 里有更细的配色，不走这里。
 */
export const deriveAppThemeVars = (palette: Palette, isDark: boolean): Record<string, string> => {
  const bg = palette["base-100"];
  const fg = palette["base-content"];
  const primary = palette.primary;
  const mix = (amount: number) => tinycolor.mix(bg, fg, amount).toHexString();
  const alphaFg = (alpha: number) => {
    const { r, g, b } = tinycolor(fg).toRgb();
    return `rgb(${r} ${g} ${b} / ${alpha})`;
  };
  const primaryForeground = tinycolor
    .mostReadable(primary, [bg, fg, "#ffffff", "#111111"], { includeFallbackColors: false })
    .toHexString();
  const card = isDark ? mix(4) : tinycolor.mix(bg, "#ffffff", 40).toHexString();
  const accent = isDark ? mix(12) : mix(9);
  const border = isDark ? alphaFg(0.1) : mix(13);
  const ring = tinycolor.mix(primary, bg, 40).toHexString();
  return {
    "--background": bg,
    "--foreground": fg,
    "--card": card,
    "--card-foreground": fg,
    "--popover": isDark ? mix(6) : card,
    "--popover-foreground": fg,
    "--primary": primary,
    "--primary-foreground": primaryForeground,
    "--secondary": isDark ? mix(8) : mix(6),
    "--secondary-foreground": fg,
    "--muted": isDark ? mix(8) : mix(6),
    "--muted-foreground": tinycolor.mix(fg, bg, isDark ? 35 : 45).toHexString(),
    "--accent": accent,
    "--accent-foreground": fg,
    "--border": border,
    "--input": isDark ? alphaFg(0.14) : mix(13),
    "--ring": ring,
    "--sidebar": isDark ? mix(3) : mix(3),
    "--sidebar-foreground": fg,
    "--sidebar-primary": primary,
    "--sidebar-primary-foreground": primaryForeground,
    "--sidebar-accent": accent,
    "--sidebar-accent-foreground": fg,
    "--sidebar-border": border,
    "--sidebar-ring": ring,
  };
};

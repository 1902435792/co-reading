import type { CustomTheme, Palette, ThemeMode } from "@/styles/themes";
import type { SystemSettings } from "@/types/settings";
import { type ThemeCode, getThemeCode } from "@/utils/style";
import { create } from "zustand";

interface ThemeState {
  themeMode: ThemeMode;
  systemIsDarkMode: boolean;
  themeCode: ThemeCode;
  isDarkMode: boolean;
  systemUIVisible: boolean;
  statusBarHeight: number;
  systemUIAlwaysHidden: boolean;
  autoScroll: boolean;
  swapSidebars: boolean;
  /** 主题色（themes.ts 里的 name），护眼 / 纸墨 / 青竹等 */
  themeColor: string;
  setThemeColor: (name: string) => void;
  setSystemUIAlwaysHidden: (hidden: boolean) => void;
  setStatusBarHeight: (height: number) => void;
  showSystemUI: () => void;
  dismissSystemUI: () => void;
  getIsDarkMode: () => boolean;
  setThemeMode: (mode: ThemeMode) => void;
  setAutoScroll: (enabled: boolean) => void;
  setSwapSidebars: (enabled: boolean) => void;
  updateAppTheme: (color: keyof Palette) => void;
  saveCustomTheme: (settings: SystemSettings, theme: CustomTheme, isDelete?: boolean) => void;
}

const getInitialThemeMode = (): ThemeMode => {
  if (typeof window !== "undefined" && localStorage) {
    return (localStorage.getItem("themeMode") as ThemeMode) || "auto";
  }
  return "auto";
};

const getInitialAutoScroll = (): boolean => {
  if (typeof window !== "undefined" && localStorage) {
    const stored = localStorage.getItem("autoScroll");
    return stored !== null ? stored === "true" : true; // 默认启用自动滚动
  }
  return true;
};

const getInitialSwapSidebars = (): boolean => {
  if (typeof window !== "undefined" && localStorage) {
    const stored = localStorage.getItem("swapSidebars");
    return stored !== null ? stored === "true" : false;
  }
  return false;
};

const getInitialThemeColor = (): string => {
  if (typeof window !== "undefined" && localStorage) {
    return localStorage.getItem("themeColor") || "default";
  }
  return "default";
};

/** 把 dark 和 theme-<name> 类同步到 html 上（shadcn 变量据此换色）。 */
export const applyThemeClasses = (themeColor: string, isDarkMode: boolean) => {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.className = root.className
    .split(" ")
    .filter((cls) => cls && cls !== "dark" && !cls.startsWith("theme-"))
    .join(" ");
  if (isDarkMode) root.classList.add("dark");
  if (themeColor && themeColor !== "default") root.classList.add(`theme-${themeColor}`);
};

/** 切换主题时短暂开启全局颜色过渡（类名不能以 theme- 开头，否则会被 applyThemeClasses 清掉）。 */
let themeSwitchTimer: ReturnType<typeof setTimeout> | null = null;
const flashThemeTransition = () => {
  if (typeof document === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  document.documentElement.classList.add("dr-theme-switching");
  if (themeSwitchTimer) clearTimeout(themeSwitchTimer);
  themeSwitchTimer = setTimeout(() => document.documentElement.classList.remove("dr-theme-switching"), 450);
};

export const useThemeStore = create<ThemeState>((set, get) => {
  const initialThemeMode = getInitialThemeMode();
  const initialAutoScroll = getInitialAutoScroll();
  const initialSwapSidebars = getInitialSwapSidebars();

  console.log("initialThemeMode", initialThemeMode);
  console.log("initialAutoScroll", initialAutoScroll);
  console.log("initialSwapSidebars", initialSwapSidebars);

  const systemIsDarkMode = typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isDarkMode = initialThemeMode === "dark" || (initialThemeMode === "auto" && systemIsDarkMode);
  const themeCode = getThemeCode();

  const initialThemeColor = getInitialThemeColor();

  if (typeof window !== "undefined") {
    applyThemeClasses(initialThemeColor, isDarkMode);

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemThemeChange = () => {
      const mode = get().themeMode;
      const isDarkMode = mode === "dark" || (mode === "auto" && mediaQuery.matches);
      applyThemeClasses(get().themeColor, isDarkMode);
      set({ systemIsDarkMode: mediaQuery.matches, isDarkMode, themeCode: getThemeCode() });
    };

    mediaQuery.addEventListener("change", handleSystemThemeChange);
  }

  return {
    themeMode: initialThemeMode,
    systemIsDarkMode,
    isDarkMode,
    themeCode,
    systemUIVisible: false,
    statusBarHeight: 24,
    systemUIAlwaysHidden: false,
    autoScroll: initialAutoScroll,
    swapSidebars: initialSwapSidebars,
    themeColor: initialThemeColor,
    setThemeColor: (name) => {
      if (typeof window !== "undefined" && localStorage) {
        localStorage.setItem("themeColor", name);
      }
      flashThemeTransition();
      applyThemeClasses(name, get().isDarkMode);
      set({ themeColor: name, themeCode: getThemeCode() });
    },
    showSystemUI: () => set({ systemUIVisible: true }),
    dismissSystemUI: () => set({ systemUIVisible: false }),
    setStatusBarHeight: (height: number) => set({ statusBarHeight: height }),
    setSystemUIAlwaysHidden: (hidden: boolean) => set({ systemUIAlwaysHidden: hidden }),
    getIsDarkMode: () => get().isDarkMode,
    setThemeMode: (mode) => {
      if (typeof window !== "undefined" && localStorage) {
        localStorage.setItem("themeMode", mode);
      }
      const isDarkMode = mode === "dark" || (mode === "auto" && get().systemIsDarkMode);

      flashThemeTransition();
      applyThemeClasses(get().themeColor, isDarkMode);

      set({ themeMode: mode, isDarkMode });
      set({ themeCode: getThemeCode() });
    },

    setAutoScroll: (enabled) => {
      if (typeof window !== "undefined" && localStorage) {
        localStorage.setItem("autoScroll", enabled.toString());
      }
      set({ autoScroll: enabled });
    },
    setSwapSidebars: (enabled) => {
      if (typeof window !== "undefined" && localStorage) {
        localStorage.setItem("swapSidebars", enabled.toString());
      }
      set({ swapSidebars: enabled });
    },
    updateAppTheme: (color) => {
      const { palette } = get().themeCode;
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", palette[color]);
    },
    saveCustomTheme: async (settings, theme, isDelete) => {
      const customThemes = settings.globalReadSettings.customThemes || [];
      const index = customThemes.findIndex((t) => t.name === theme.name);
      if (isDelete) {
        if (index > -1) {
          customThemes.splice(index, 1);
        }
      } else {
        if (index > -1) {
          customThemes[index] = theme;
        } else {
          customThemes.push(theme);
        }
      }
      settings.globalReadSettings.customThemes = customThemes;
      localStorage.setItem("customThemes", JSON.stringify(customThemes));
    },
  };
});

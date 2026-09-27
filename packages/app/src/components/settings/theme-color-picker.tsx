import { useThemeStore } from "@/store/theme-store";
import { APP_WIDE_THEMES, THEME_LABELS_ZH, themes } from "@/styles/themes";
import { Check } from "lucide-react";

interface ThemeColorPickerProps {
  /** 紧凑模式：用于阅读设置下拉，只显示色块 */
  compact?: boolean;
}

/** 主题色选择：护眼 / 纸墨 / 青竹等。带 ✦ 的会连同整个界面一起换色。 */
export function ThemeColorPicker({ compact = false }: ThemeColorPickerProps) {
  const themeColor = useThemeStore((state) => state.themeColor);
  const setThemeColor = useThemeStore((state) => state.setThemeColor);
  const isDarkMode = useThemeStore((state) => state.isDarkMode);

  return (
    <div className={compact ? "flex flex-wrap gap-1.5" : "grid grid-cols-4 gap-2 sm:grid-cols-7"}>
      {themes.map((theme) => {
        const palette = isDarkMode ? theme.colors.dark : theme.colors.light;
        const selected = themeColor === theme.name;
        const label = THEME_LABELS_ZH[theme.name] ?? theme.label;
        const appWide = (APP_WIDE_THEMES as readonly string[]).includes(theme.name);
        return (
          <button
            key={theme.name}
            type="button"
            title={appWide ? `${label}（整个界面一起换色）` : `${label}（阅读页）`}
            aria-label={`主题色：${label}`}
            aria-pressed={selected}
            onClick={() => setThemeColor(theme.name)}
            className={`group hover:-translate-y-0.5 flex flex-col items-center gap-1 rounded-lg transition-transform duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              compact ? "" : "p-1"
            }`}
          >
            <span
              className={`relative flex items-center justify-center overflow-hidden rounded-full border shadow-sm transition-shadow duration-200 group-hover:shadow-md ${
                compact ? "size-6" : "size-9"
              } ${selected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}
              style={{
                background: `linear-gradient(135deg, ${palette["base-100"]} 0 55%, ${palette.primary} 55% 100%)`,
              }}
            >
              <span className="font-medium text-[10px]" style={{ color: palette["base-content"] }}>
                {compact ? "" : "文"}
              </span>
              {selected && (
                <Check className="absolute right-0.5 bottom-0.5 size-3" style={{ color: palette["base-100"] }} />
              )}
            </span>
            {!compact && (
              <span className="text-[11px] text-muted-foreground group-aria-pressed:text-foreground">
                {label}
                {appWide ? " ✦" : ""}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

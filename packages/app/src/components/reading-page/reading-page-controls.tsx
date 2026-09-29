import { ThemeColorPicker } from "@/components/settings/theme-color-picker";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  ANNOTATION_PREFS_EVENT,
  type AnnotationPrefs,
  HIGHLIGHT_STRENGTH_LABELS,
  LAYOUT_RANGES,
  type LayoutKey,
  PALETTE_LABELS,
  READING_BACKGROUNDS,
  SOFT_PALETTE,
  UNDERLINE_STYLE_LABELS,
  UNDERLINE_WEIGHT_LABELS,
  applyReadingBg,
  backgroundLayers,
  clampLayoutValue,
  formatLayoutValue,
  getAnnotationPrefs,
  getReadingBgId,
  setAnnotationPrefs,
} from "@/lib/reading-page";
import { HIGHLIGHT_COLOR_HEX } from "@/services/constants";
import { useAppSettingsStore } from "@/store/app-settings-store";
import type { ViewSettings } from "@/types/book";
import { Check } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

type Section = "theme" | "background" | "layout" | "annotation";

interface ReadingPageControlsProps {
  /** 紧凑模式：阅读页的设置下拉 */
  compact?: boolean;
  sections?: Section[];
}

function updateViewSettings(patch: Partial<ViewSettings>) {
  const { settings, setSettings } = useAppSettingsStore.getState();
  setSettings({ ...settings, globalViewSettings: { ...settings.globalViewSettings, ...patch } });
}

function useAnnotationPrefs(): [AnnotationPrefs, (patch: Partial<AnnotationPrefs>) => void] {
  const [prefs, setPrefs] = useState<AnnotationPrefs>(() => getAnnotationPrefs());
  useEffect(() => {
    const onChange = () => setPrefs(getAnnotationPrefs());
    window.addEventListener(ANNOTATION_PREFS_EVENT, onChange);
    return () => window.removeEventListener(ANNOTATION_PREFS_EVENT, onChange);
  }, []);
  return [prefs, (patch) => setPrefs(setAnnotationPrefs(patch))];
}

function Title({ children, compact }: { children: ReactNode; compact?: boolean }) {
  return <div className={`${compact ? "mb-2" : "mb-3"} font-medium text-sm`}>{children}</div>;
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: Record<T, string>;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex rounded-lg bg-muted p-0.5">
      {(Object.keys(options) as T[]).map((key) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={value === key}
          onClick={() => onChange(key)}
          className={`rounded-md px-2.5 py-1 text-xs transition-all duration-200 ${
            value === key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {options[key]}
        </button>
      ))}
    </div>
  );
}

/** 这几项调过之后压过书本自带样式（不然很多书调了看不出变化） */
const TYPOGRAPHY_FIELDS: LayoutKey[] = ["lineHeight", "paragraphMargin", "textIndent", "letterSpacing"];

function LayoutSlider({ field, value }: { field: LayoutKey; value: number }) {
  const range = LAYOUT_RANGES[field];
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{range.label}</span>
        <span className="tabular-nums">{formatLayoutValue(field, local)}</span>
      </div>
      <Slider
        value={[local]}
        min={range.min}
        max={range.max}
        step={range.step}
        aria-label={range.label}
        onValueChange={(next) => setLocal(clampLayoutValue(field, next[0] ?? range.min))}
        onValueCommit={(next) =>
          updateViewSettings({
            [field]: clampLayoutValue(field, next[0] ?? range.min),
            ...(TYPOGRAPHY_FIELDS.includes(field) ? { layoutCustomized: true } : {}),
          })
        }
      />
    </div>
  );
}

/** 阅读页面外观控制：主题色、背景（含纸质纹理）、排版、标注样式。阅读页下拉和设置页共用。 */
export function ReadingPageControls({
  compact = false,
  sections = ["theme", "background", "layout", "annotation"],
}: ReadingPageControlsProps) {
  const view = useAppSettingsStore((state) => state.settings.globalViewSettings);
  const [prefs, setPrefs] = useAnnotationPrefs();
  const currentBg = getReadingBgId(view.userStylesheet);
  const layoutFields: LayoutKey[] = compact
    ? ["lineHeight", "paragraphMargin", "textIndent", "readingWidth", "gapPercent"]
    : ["lineHeight", "paragraphMargin", "readingWidth", "gapPercent", "textIndent", "letterSpacing"];
  const layoutValue = (field: LayoutKey): number => {
    if (field === "readingWidth") return view.readingWidth ?? 0;
    return Number((view as unknown as Record<string, unknown>)[field] ?? LAYOUT_RANGES[field].min);
  };
  const palette = prefs.palette === "soft" ? SOFT_PALETTE : HIGHLIGHT_COLOR_HEX;

  return (
    <div className={compact ? "space-y-4" : "space-y-6"}>
      {sections.includes("theme") && (
        <div>
          <Title compact={compact}>主题色</Title>
          <ThemeColorPicker compact={compact} />
        </div>
      )}

      {sections.includes("background") && (
        <div>
          <Title compact={compact}>阅读背景</Title>
          <div className={compact ? "flex flex-wrap gap-2" : "grid grid-cols-5 gap-3 sm:grid-cols-10"}>
            {READING_BACKGROUNDS.map((preset) => {
              const layers = backgroundLayers(preset);
              const selected = currentBg === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  title={preset.name}
                  aria-label={`阅读背景：${preset.name}`}
                  aria-pressed={selected}
                  onClick={() => updateViewSettings({ userStylesheet: applyReadingBg(view.userStylesheet, preset.id) })}
                  className="group flex flex-col items-center gap-1 focus-visible:outline-none"
                >
                  <span
                    className={`group-hover:-translate-y-0.5 relative flex items-center justify-center rounded-full border transition-all duration-200 group-hover:shadow-md group-focus-visible:ring-2 group-focus-visible:ring-ring ${
                      compact ? "size-7" : "size-10"
                    } ${selected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""} ${
                      preset.id === "default" ? "border-dashed bg-background" : ""
                    }`}
                    style={
                      preset.id === "default"
                        ? undefined
                        : {
                            backgroundColor: preset.bg,
                            backgroundImage: layers?.image,
                            backgroundSize: layers ? layers.size.replace(/220px 220px/g, "90px 90px") : undefined,
                          }
                    }
                  >
                    {selected ? (
                      <Check className="size-3.5" style={{ color: preset.fg || "currentColor" }} />
                    ) : preset.id === "default" ? (
                      <span className="text-[9px] text-muted-foreground">主题</span>
                    ) : null}
                  </span>
                  {!compact && <span className="text-[11px] text-muted-foreground">{preset.name}</span>}
                </button>
              );
            })}
          </div>
          {compact && (
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {READING_BACKGROUNDS.find((item) => item.id === currentBg)?.name ?? "跟随主题"}
            </p>
          )}
        </div>
      )}

      {sections.includes("layout") && (
        <div>
          <Title compact={compact}>排版</Title>
          <div className={compact ? "space-y-3" : "grid gap-x-8 gap-y-4 sm:grid-cols-2"}>
            {layoutFields.map((field) => (
              <LayoutSlider key={field} field={field} value={layoutValue(field)} />
            ))}
          </div>
          {view.layoutCustomized && !view.overrideLayout && (
            <button
              type="button"
              onClick={() => updateViewSettings({ layoutCustomized: false })}
              className="mt-3 text-primary text-xs underline-offset-2 hover:underline"
            >
              恢复书本原排版（行距、段距、缩进用书自带的）
            </button>
          )}
          {!compact && (
            <label className="mt-4 flex items-center justify-between gap-3 text-sm">
              <span>
                强制使用我的排版
                <span className="mt-1 block text-muted-foreground text-xs">书本自带样式会覆盖行距、缩进时打开</span>
              </span>
              <Switch
                checked={!!view.overrideLayout}
                onCheckedChange={(checked) => updateViewSettings({ overrideLayout: checked })}
              />
            </label>
          )}
        </div>
      )}

      {sections.includes("annotation") && (
        <div>
          <Title compact={compact}>划线与高亮</Title>
          <div className="space-y-3">
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>
                在书上隐藏划线和批注
                <span className="mt-1 block text-muted-foreground text-xs">
                  只看干净的正文，所有书通用；划线、评论和 Nova 的边注都还在，书评区照常能看
                </span>
              </span>
              <Switch checked={prefs.hideOnPage} onCheckedChange={(hideOnPage) => setPrefs({ hideOnPage })} />
            </label>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground text-xs">下划线</span>
              <Segmented
                ariaLabel="下划线样式"
                value={prefs.underlineStyle}
                options={UNDERLINE_STYLE_LABELS}
                onChange={(underlineStyle) => setPrefs({ underlineStyle })}
              />
            </div>
            {!compact && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground text-xs">线条粗细</span>
                <Segmented
                  ariaLabel="线条粗细"
                  value={prefs.underlineWeight}
                  options={UNDERLINE_WEIGHT_LABELS}
                  onChange={(underlineWeight) => setPrefs({ underlineWeight })}
                />
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground text-xs">高亮浓淡</span>
              <Segmented
                ariaLabel="高亮浓淡"
                value={prefs.highlightStrength}
                options={HIGHLIGHT_STRENGTH_LABELS}
                onChange={(highlightStrength) => setPrefs({ highlightStrength })}
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1 text-muted-foreground text-xs">
                配色
                <span className="ml-1 flex gap-0.5">
                  {Object.entries(palette).map(([name, hex]) => (
                    <span key={name} className="size-2.5 rounded-full" style={{ backgroundColor: hex }} />
                  ))}
                </span>
              </span>
              <Segmented
                ariaLabel="高亮配色"
                value={prefs.palette}
                options={PALETTE_LABELS}
                onChange={(next) => setPrefs({ palette: next })}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

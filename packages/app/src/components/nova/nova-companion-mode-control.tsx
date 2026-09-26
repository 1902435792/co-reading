import { type NovaCompanionMode, setNovaCompanionMode, useNovaCompanionMode } from "./nova-companion-mode";

const OPTIONS: { value: NovaCompanionMode; label: string }[] = [
  { value: "full", label: "形象＋气泡" },
  { value: "bubble", label: "只要气泡" },
  { value: "off", label: "关闭" },
];

/** 共读面板里的 Nova 形象开关。 */
export function NovaCompanionModeControl() {
  const mode = useNovaCompanionMode();
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="shrink-0 text-muted-foreground">Nova 形象</span>
      <div role="radiogroup" aria-label="Nova 形象" className="flex rounded-md border p-0.5">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={mode === option.value}
            className={`rounded px-2 py-0.5 transition-colors ${
              mode === option.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
            onClick={() => setNovaCompanionMode(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

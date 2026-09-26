import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { type JevSettings, defaultJevModel } from "@/services/jev-rules";
import {
  getJevStats,
  isJevConfigured,
  resetJevStats,
  testJevConnection,
  updateJevSettings,
  useJevSettings,
} from "@/services/jev-service";
import { CheckCircle2, CircleAlert, Loader2 } from "lucide-react";
import { useState } from "react";

type TestState =
  | { status: "idle" }
  | { status: "testing" }
  | { status: "ok"; text: string }
  | { status: "fail"; text: string };

const SKIP_LEVEL_LABEL: Record<JevSettings["skipLevel"], string> = {
  conservative: "保守：只跳过目录、版权页、参考文献等非正文",
  normal: "标准：另外跳过明显没什么可批注的正文页",
  eager: "积极：跳得更多，更省时间，但可能漏掉好内容",
};

export function JevSettingsSection() {
  const settings = useJevSettings();
  const [test, setTest] = useState<TestState>({ status: "idle" });
  const [stats, setStats] = useState(() => getJevStats());
  const configured = isJevConfigured(settings);

  const runTest = async () => {
    setTest({ status: "testing" });
    try {
      const result = await testJevConnection(settings);
      const kind = result.gate.pageKind === "body" ? "正文" : (result.gate.pageKind ?? "未知");
      const worth = result.gate.worth === null ? "—" : `${Math.round(result.gate.worth * 100)}%`;
      setTest({
        status: "ok",
        text: `连接正常，用时 ${result.latencyMs} 毫秒。示例判断：${kind}，值得批注 ${worth}，表情「${
          result.reaction?.criteria ?? "未选出"
        }」。`,
      });
    } catch (error) {
      setTest({ status: "fail", text: error instanceof Error ? error.message : String(error) });
    }
  };

  return (
    <section className="rounded-lg bg-muted/80 p-4">
      <h2 className="text mb-1 flex items-center gap-2 dark:text-neutral-200">
        Jev 快速判断
        <span className="rounded bg-amber-100 px-1.5 py-px text-[10px] text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
          实验
        </span>
      </h2>
      <p className="mb-4 text-muted-foreground text-xs leading-relaxed">
        Jev 是 TypeSafe AI 的决策模型：不写文字，只在 0.1–0.5 秒内做选择题。开启后，它会在调用较慢的共读 Agent
        之前先判断这一页值不值得批注，并为 Nova 挑选表情。出错或 3 秒内没有返回时，会自动按原来的流程处理。
        注意：页面原文会发送到 Jev 服务（美国）。
      </p>

      <div className="space-y-3">
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>
            共读预筛
            <span className="block text-muted-foreground text-xs">不值得批注的页直接跳过，不再等 Agent</span>
          </span>
          <Switch checked={settings.prefilter} onCheckedChange={(value) => updateJevSettings({ prefilter: value })} />
        </label>
        {settings.prefilter && (
          <select
            className="h-8 w-full rounded-md border bg-background px-2 text-xs"
            value={settings.skipLevel}
            onChange={(event) => updateJevSettings({ skipLevel: event.target.value as JevSettings["skipLevel"] })}
            aria-label="跳过力度"
          >
            {Object.entries(SKIP_LEVEL_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        )}
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>
            Nova 表情
            <span className="block text-muted-foreground text-xs">按书评的情绪从 12 种表情里挑一种</span>
          </span>
          <Switch checked={settings.mood} onCheckedChange={(value) => updateJevSettings({ mood: value })} />
        </label>

        <div className="space-y-2 rounded-md bg-background/60 p-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="shrink-0 text-muted-foreground">接口</span>
            <select
              className="h-8 flex-1 rounded-md border bg-background px-2 text-xs"
              value={settings.endpoint}
              onChange={(event) => updateJevSettings({ endpoint: event.target.value as JevSettings["endpoint"] })}
              aria-label="Jev 接口"
            >
              <option value="typesafe">TypeSafe 原生接口 / 中转（/v1/systemone）</option>
              <option value="openrouter">OpenRouter</option>
              <option value="workers-ai">Cloudflare Workers AI / 兼容接口（如 Laya）</option>
            </select>
          </div>
          {settings.endpoint !== "openrouter" && (
            <Input
              className="h-8 bg-background text-xs"
              placeholder={
                settings.endpoint === "typesafe"
                  ? "https://…/v1/systemone"
                  : "https://api.cloudflare.com/client/v4/accounts/<账户ID>/ai/run"
              }
              value={settings.baseUrl}
              onChange={(event) => updateJevSettings({ baseUrl: event.target.value })}
              spellCheck={false}
              aria-label="Jev 接口地址"
            />
          )}
          <Input
            className="h-8 bg-background text-xs"
            type="password"
            placeholder={
              settings.endpoint === "openrouter"
                ? "OpenRouter API Key（留空则使用「模型提供商」里的 OpenRouter Key）"
                : "API Token（公开的兼容接口可以留空）"
            }
            value={settings.apiKey}
            onChange={(event) => updateJevSettings({ apiKey: event.target.value })}
            spellCheck={false}
            aria-label="Jev API Key"
          />
          <Input
            className="h-8 bg-background text-xs"
            placeholder={`模型（留空使用 ${defaultJevModel(settings.endpoint)}）`}
            value={settings.model}
            onChange={(event) => updateJevSettings({ model: event.target.value })}
            spellCheck={false}
            aria-label="Jev 模型"
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              disabled={!configured || test.status === "testing"}
              onClick={() => void runTest()}
            >
              {test.status === "testing" && <Loader2 className="mr-1 size-3.5 animate-spin" />}
              测试
            </Button>
            {!configured && <span className="text-muted-foreground text-xs">先填写 Key 或接口地址</span>}
          </div>
          {test.status === "ok" && (
            <p className="flex items-start gap-1.5 text-emerald-700 text-xs dark:text-emerald-300">
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
              {test.text}
            </p>
          )}
          {test.status === "fail" && (
            <p className="flex items-start gap-1.5 text-rose-700 text-xs dark:text-rose-300">
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
              {test.text}
            </p>
          )}
        </div>

        {(stats.checked > 0 || stats.failed > 0) && (
          <div className="flex items-center justify-between gap-2 text-muted-foreground text-xs">
            <span>
              已预筛 {stats.checked} 页，跳过 {stats.skipped} 页{stats.failed > 0 && `，失败 ${stats.failed} 次`}
              {stats.lastReason && `（最近一次：${stats.lastReason}）`}
            </span>
            <button
              type="button"
              className="underline underline-offset-2"
              onClick={() => {
                resetJevStats();
                setStats(getJevStats());
              }}
            >
              清零
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

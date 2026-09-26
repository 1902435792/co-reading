import { NovaCompanionModeControl } from "@/components/nova/nova-companion-mode-control";
import { updateNovaExtras, useNovaExtras } from "@/components/nova/nova-extras";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useProviderStore } from "@/store/provider-store";
import { fetch as fetchTauri } from "@tauri-apps/plugin-http";
import { CheckCircle2, CircleAlert, Loader2 } from "lucide-react";
import { useState } from "react";
import { openSettings } from "./open-settings";
import { JevSettingsSection } from "./jev-settings-section";

const DEFAULT_BRIDGE_ORIGIN = "http://127.0.0.1:3100";
const NOVA_POSITION_KEY = "deepreader:nova-companion-position";

function toOrigin(baseUrl?: string): string | null {
  if (!baseUrl) return null;
  try {
    return new URL(baseUrl).origin;
  } catch {
    return null;
  }
}

interface HealthBody {
  ok?: boolean;
  upstream?: { ok?: boolean; latencyMs?: number; status?: number };
}

type CheckState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "ok"; latencyMs: number; upstreamMs?: number }
  | { status: "fail"; message: string };

export default function CoReadingSettings() {
  const { modelProviders } = useProviderStore();
  const bridgeProviders = modelProviders.filter((provider) => /:3100(\/|$)/.test(provider.baseUrl ?? ""));
  const [origin, setOrigin] = useState(() => toOrigin(bridgeProviders[0]?.baseUrl) ?? DEFAULT_BRIDGE_ORIGIN);
  const [check, setCheck] = useState<CheckState>({ status: "idle" });
  const [positionReset, setPositionReset] = useState(false);
  const novaExtras = useNovaExtras();

  const runCheck = async () => {
    setCheck({ status: "checking" });
    const startedAt = performance.now();
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetchTauri(`${origin.replace(/\/+$/, "")}/health?deep=1`, {
        signal: controller.signal,
      });
      const body = (await response.json().catch(() => null)) as HealthBody | null;
      const latencyMs = Math.round(performance.now() - startedAt);
      if (response.ok && body?.ok !== false) {
        setCheck({ status: "ok", latencyMs, upstreamMs: body?.upstream?.latencyMs });
      } else if (body?.upstream && body.upstream.ok === false) {
        setCheck({ status: "fail", message: "Bridge 在线，但上游 VCP 不可用：请确认 VCP 后端（vcp-main）已启动。" });
      } else {
        setCheck({ status: "fail", message: `Bridge 返回了 HTTP ${response.status}。` });
      }
    } catch (error) {
      const aborted = error instanceof Error && error.name === "AbortError";
      setCheck({
        status: "fail",
        message: aborted
          ? "10 秒内没有响应：VCP 可能没有启动，或正在重建知识库。"
          : `连接失败：${error instanceof Error ? error.message : String(error)}。请确认 VCP 已启动、地址正确。`,
      });
    } finally {
      window.clearTimeout(timer);
    }
  };

  return (
    <div className="space-y-8 p-4 pt-3">
      <section className="rounded-lg bg-muted/80 p-4">
        <h2 className="text mb-1 dark:text-neutral-200">VCP Bridge 连接</h2>
        <p className="mb-4 text-muted-foreground text-xs leading-relaxed">
          共读和问答通过 VCP Bridge 调用 VCP 的 Agent。先在「模型提供商」里添加一个 OpenAI-compatible 提供商，基础 URL
          填 <code>http://127.0.0.1:3100/v1</code>。
        </p>

        <div className="mb-3 text-xs">
          {bridgeProviders.length > 0 ? (
            <span className="text-muted-foreground">
              已找到 {bridgeProviders.length} 个指向 Bridge 的提供商：
              <span className="text-foreground">{bridgeProviders.map((provider) => provider.name).join("、")}</span>
            </span>
          ) : (
            <span className="text-amber-700 dark:text-amber-300">
              还没有指向 Bridge（端口 3100）的提供商。
              <button
                type="button"
                className="ml-1 underline underline-offset-2"
                onClick={() => openSettings("model-providers")}
              >
                去添加
              </button>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Input
            value={origin}
            onChange={(event) => setOrigin(event.target.value)}
            className="h-8 flex-1 bg-background text-xs"
            aria-label="Bridge 地址"
            spellCheck={false}
          />
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            disabled={check.status === "checking"}
            onClick={() => void runCheck()}
          >
            {check.status === "checking" && <Loader2 className="mr-1 size-3.5 animate-spin" />}
            检查连接
          </Button>
        </div>

        {check.status === "ok" && (
          <p className="mt-2 flex items-center gap-1.5 text-emerald-700 text-xs dark:text-emerald-300">
            <CheckCircle2 className="size-3.5" />
            连接正常：Bridge 用时 {check.latencyMs} 毫秒
            {check.upstreamMs != null && `，上游 VCP 响应 ${check.upstreamMs} 毫秒`}。
          </p>
        )}
        {check.status === "fail" && (
          <p className="mt-2 flex items-start gap-1.5 text-rose-700 text-xs dark:text-rose-300">
            <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
            {check.message}
          </p>
        )}
      </section>

      <section className="rounded-lg bg-muted/80 p-4">
        <h2 className="text mb-3 dark:text-neutral-200">共读模型</h2>
        <ul className="list-disc space-y-1.5 pl-4 text-muted-foreground text-xs leading-relaxed">
          <li>每本书的共读模型在阅读页右侧「共读」面板里选；不单独选择时，跟随问答当前选中的模型。</li>
          <li>
            模型 ID 写成 <code>Profile/模型</code>。自动共读推荐 <code>coreading-lite/gemini-3.8-flash-high</code>
            ：只召回阅读相关记忆，速度更快。
          </li>
          <li>深度思考模型单次可能要 1–3 分钟；共读请求最长等 180 秒，超时后进度会保留，可以稍后重试。</li>
          <li>
            「共读日记」按钮使用专用路由 <code>deepreader-coreading-diary</code>，一般不用改。
          </li>
        </ul>
      </section>

      <JevSettingsSection />

      <section className="rounded-lg bg-muted/80 p-4">
        <h2 className="text mb-1 dark:text-neutral-200">Nova 共读形象</h2>
        <p className="mb-4 text-muted-foreground text-xs leading-relaxed">
          开启共读后，Nova
          会出现在阅读区右下角：读到哪里、想到什么都会用气泡告诉你，点击气泡可以跳到原文。可以拖动；右键头像有更多操作（再看边注、沉浸阅读、复位位置等）。
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <NovaCompanionModeControl />
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => {
              window.localStorage.removeItem(NOVA_POSITION_KEY);
              setPositionReset(true);
            }}
          >
            {positionReset ? "已重置，重新打开书后生效" : "重置 Nova 位置"}
          </Button>
        </div>
        <div className="mt-4 space-y-3">
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>
              合书小结
              <span className="block text-muted-foreground text-xs">
                关掉阅读标签页时，Nova 告诉你这次读了多久、读到哪、留了几条边注
              </span>
            </span>
            <Switch
              checked={novaExtras.sessionSummary}
              onCheckedChange={(value) => updateNovaExtras({ sessionSummary: value })}
            />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>
              深夜陪读
              <span className="block text-muted-foreground text-xs">23 点到 5 点换成困倦表情，每 45 分钟提醒一次休息</span>
            </span>
            <Switch checked={novaExtras.lateNight} onCheckedChange={(value) => updateNovaExtras({ lateNight: value })} />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>
              书架上的 Nova
              <span className="block text-muted-foreground text-xs">书卡上显示一句话：很久没翻、快读完、刚读完、新书</span>
            </span>
            <Switch checked={novaExtras.shelfLines} onCheckedChange={(value) => updateNovaExtras({ shelfLines: value })} />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>
              卡住时探头
              <span className="block text-muted-foreground text-xs">
                同一页停留 1.5 分钟以上，Nova 会问要不要帮你拆解；配置了 Jev 时先判断这页是否真的难懂。默认关闭
              </span>
            </span>
            <Switch checked={novaExtras.stuckHint} onCheckedChange={(value) => updateNovaExtras({ stuckHint: value })} />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>
              章末卡片
              <span className="block text-muted-foreground text-xs">
                认真读完一章（2 分钟以上）翻到下一章时，Nova 问要不要做一张小结 + 3 道自测题的卡片，可导出到 Obsidian。默认关闭；右键
                Nova 随时可以手动做
              </span>
            </span>
            <Switch
              checked={novaExtras.chapterCard}
              onCheckedChange={(value) => updateNovaExtras({ chapterCard: value })}
            />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>
              跨书联想
              <span className="block text-muted-foreground text-xs">
                这一页提到书架上的另一本书、或出现你在其他书里记下的概念时，Nova 提一句；每处只提一次，最多 3 分钟一次
              </span>
            </span>
            <Switch checked={novaExtras.crossBook} onCheckedChange={(value) => updateNovaExtras({ crossBook: value })} />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>
              情绪曲线
              <span className="block text-muted-foreground text-xs">
                需要 Jev：每翻一页让 Jev 判断这页的情绪基调，右键 Nova →「情绪曲线」看整本书的起伏。会把页面文字发给 Jev
                接口，默认关闭
              </span>
            </span>
            <Switch
              checked={novaExtras.emotionCurve}
              onCheckedChange={(value) => updateNovaExtras({ emotionCurve: value })}
            />
          </label>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span>
              AI 边注样式
              <span className="block text-muted-foreground text-xs">
                墨点：只在句末点一个小墨点，评论越长墨色越深；鼠标移上去浮出边注，不挡正文
              </span>
            </span>
            <div className="flex shrink-0 overflow-hidden rounded-md border text-xs">
              {(
                [
                  ["underline", "下划线"],
                  ["ink", "墨点"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`px-2.5 py-1 ${novaExtras.aiNoteStyle === value ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                  onClick={() => updateNovaExtras({ aiNoteStyle: value })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="mt-3 text-muted-foreground text-xs">
          沉浸阅读：点阅读页顶栏的 ⤢ 按钮、按 Z 或右键 Nova 进入，只留正文和小头像 Nova；按 Esc 退出。
          <br />
          问 Nova：选中文字后点弹条里的「问Nova」、或选中后直接点 Nova、或把文字拖到 Nova 身上，可以让她解释、反驳、联想或总结。
        </p>
      </section>
    </div>
  );
}

import { Switch } from "@/components/ui/switch";
import {
  TRIGGER_SECONDS_MAX,
  TRIGGER_SECONDS_MIN,
  setCoReadingTrigger,
  useCoReadingTrigger,
} from "@/lib/co-reading-trigger";
import { isJevConfigured, useJevSettings } from "@/services/jev-service";
import { Brain, Clock3, FastForward, Zap } from "lucide-react";

/** 共读触发方式：智能判断 / 固定停留秒数 / JEV 波浪线（每台设备各自保存）。 */
export function CoReadingTriggerControls() {
  const trigger = useCoReadingTrigger();
  const jev = useJevSettings();
  const jevReady = isJevConfigured(jev);

  return (
    <div className="mt-3 space-y-2.5 rounded-lg bg-background/70 px-2.5 py-2 text-xs">
      <label className="flex items-center gap-2">
        <Brain className="size-4 shrink-0 text-primary" />
        <span className="flex-1">智能判断</span>
        <Switch
          checked={trigger.smart}
          onCheckedChange={(smart) => setCoReadingTrigger({ smart })}
        />
      </label>
      <p className="pl-6 text-[11px] text-muted-foreground leading-relaxed">
        {trigger.smart
          ? `按每段字数估算读完要多久，快速划过的不算读过；你停下 ${trigger.seconds} 秒就把读过的发出去${
              jevReady ? "，先让 JEV 判断值不值得批注，再交给 Nova" : "（配置 JEV 后还会先判断值不值得批注）"
            }。`
          : `每段在屏幕上停留 ${trigger.seconds} 秒就算读过，直接交给 Nova。`}
      </p>

      <label className="flex items-center gap-2">
        <Clock3 className="size-4 shrink-0 text-primary" />
        <span className="shrink-0">
          {trigger.smart ? "停顿" : "停留"} {trigger.seconds} 秒
        </span>
        <input
          type="range"
          min={TRIGGER_SECONDS_MIN}
          max={TRIGGER_SECONDS_MAX}
          step={1}
          value={trigger.seconds}
          onChange={(event) => setCoReadingTrigger({ seconds: Number(event.target.value) })}
          className="min-w-0 flex-1"
        />
      </label>

      <label className="flex items-center gap-2">
        <Zap className="size-4 shrink-0 text-amber-500" />
        <span className="flex-1">快速模型</span>
        <Switch checked={trigger.fast} onCheckedChange={(fast) => setCoReadingTrigger({ fast })} />
      </label>
      <p className="pl-6 text-[11px] text-muted-foreground leading-relaxed">
        {trigger.fast
          ? "自动边注用不深度思考的版本（去掉 -high），通常几秒到十几秒就出来。"
          : "按选中的模型原样请求；带 -high 的深度思考版每次可能要 1–3 分钟。"}
      </p>

      <label className="flex items-center gap-2">
        <FastForward className="size-4 shrink-0 text-sky-500" />
        <span className="flex-1">提前发给 Nova</span>
        <Switch checked={trigger.ahead} onCheckedChange={(ahead) => setCoReadingTrigger({ ahead })} />
      </label>
      <p className="pl-6 text-[11px] text-muted-foreground leading-relaxed">
        {trigger.ahead
          ? "这一屏读完一段，就把这一屏剩下的也一起交给 Nova；模型慢时还会同时多发一批。读到那里时边注多半已经写好了。"
          : "每段读完才交给 Nova，一次只发一批。"}
      </p>

    </div>
  );
}

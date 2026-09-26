import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useId, useMemo, useState } from "react";
import { type EmotionPoint, buildEmotionChart, emotionExtremes } from "./emotion-curve";

const WIDTH = 560;
const HEIGHT = 220;

export function EmotionCurveDialog({
  open,
  onOpenChange,
  bookTitle,
  points,
  enabled,
  jevReady,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookTitle: string;
  points: EmotionPoint[];
  enabled: boolean;
  jevReady: boolean;
}) {
  const clipId = useId().replace(/:/g, "");
  const chart = useMemo(() => buildEmotionChart(points, WIDTH, HEIGHT), [points]);
  const { brightest, darkest } = useMemo(() => emotionExtremes(points), [points]);
  const [hover, setHover] = useState<EmotionPoint | null>(null);
  const describe = (point: EmotionPoint) =>
    `${point.sectionLabel || "未知章节"} · ${Math.round(point.fraction * 100)}%`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">情绪曲线 · 《{bookTitle}》</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 px-4 py-4 text-sm">
          {points.length < 2 ? (
            <p className="rounded-lg bg-muted px-4 py-6 text-center text-muted-foreground">
              {!jevReady
                ? "情绪曲线需要 Jev：先在设置 → 共读里配置 Jev。"
                : !enabled
                  ? "还没开始记录：在设置 → 共读里打开「情绪曲线」，之后每翻一页 Nova 都会记一笔。"
                  : "再读几页就能看到曲线啦（至少需要 2 个采样点）。"}
            </p>
          ) : (
            <>
              <svg
                viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                className="w-full rounded-lg border bg-background"
                role="img"
                aria-label="情绪曲线"
                onMouseLeave={() => setHover(null)}
              >
                <defs>
                  <clipPath id={`${clipId}-up`}>
                    <rect x="0" y="0" width={WIDTH} height={chart.zeroY} />
                  </clipPath>
                  <clipPath id={`${clipId}-down`}>
                    <rect x="0" y={chart.zeroY} width={WIDTH} height={HEIGHT - chart.zeroY} />
                  </clipPath>
                </defs>
                <text x="8" y="16" className="fill-amber-600 text-[10px]">
                  明亮
                </text>
                <text x="8" y={HEIGHT - 8} className="fill-sky-600 text-[10px]">
                  低沉
                </text>
                <line
                  x1="0"
                  x2={WIDTH}
                  y1={chart.zeroY}
                  y2={chart.zeroY}
                  className="stroke-muted-foreground/40"
                  strokeDasharray="4 4"
                />
                <path d={chart.area} className="fill-amber-400/35" clipPath={`url(#${clipId}-up)`} />
                <path d={chart.area} className="fill-sky-400/35" clipPath={`url(#${clipId}-down)`} />
                <path
                  d={chart.line}
                  fill="none"
                  className="stroke-foreground/70"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
                {chart.dots.map((dot) => (
                  <circle
                    key={`${dot.point.fraction}-${dot.point.at}`}
                    cx={dot.x}
                    cy={dot.y}
                    r={hover === dot.point ? dot.r + 2 : dot.r}
                    className={dot.point.valence >= 0 ? "fill-amber-500" : "fill-sky-500"}
                    onMouseEnter={() => setHover(dot.point)}
                  />
                ))}
              </svg>
              <p className="h-5 text-muted-foreground text-xs">
                {hover
                  ? `${describe(hover)} · ${hover.valence >= 0.1 ? "明亮" : hover.valence <= -0.1 ? "低沉" : "平静"} · 强度 ${Math.round(hover.intensity * 100)}%`
                  : "鼠标移到圆点上看是哪一段；横轴是全书进度，圆点越大情绪越强烈。"}
              </p>
              <ul className="space-y-1 text-xs">
                <li>共 {points.length} 个采样点</li>
                {brightest && <li>☀ 最明亮的一段：{describe(brightest)}</li>}
                {darkest && <li>☁ 最低沉的一段：{describe(darkest)}</li>}
              </ul>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

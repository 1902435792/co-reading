import { NOVA_STATIC_AVATAR } from "@/components/nova/nova-assets";
import { getNovaExtras } from "@/components/nova/nova-extras";
import { activeMsFromStats, buildReadingSummary, isLateNight, progressPercent } from "@/components/nova/nova-moments";
import { SessionState } from "@/types/reading-session";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useReaderStore } from "../components/reader-provider";

/** 关书（阅读标签页关闭）时，用 Nova 的口吻弹出本次阅读小结。 */
export function useReadingSummary(bookId: string | null) {
  const sessionStats = useReaderStore((state) => state.sessionStats);
  const pageinfo = useReaderStore((state) => state.progress?.pageinfo);
  const annotated = useReaderStore((state) => state.coReadingSnapshot?.stats.annotated ?? null);

  const percent = progressPercent(pageinfo);
  const latestRef = useRef({ sessionStats, percent, annotated });
  latestRef.current = { sessionStats, percent, annotated };
  const startRef = useRef<{ percent: number | null; annotated: number | null }>({ percent: null, annotated: null });

  useEffect(() => {
    if (startRef.current.percent === null && percent !== null) startRef.current.percent = percent;
  }, [percent]);
  useEffect(() => {
    if (startRef.current.annotated === null && annotated !== null) startRef.current.annotated = annotated;
  }, [annotated]);

  useEffect(() => {
    if (!bookId) return;
    return () => {
      if (!getNovaExtras().sessionSummary) return;
      const latest = latestRef.current;
      const start = startRef.current;
      const now = Date.now();
      const stats = latest.sessionStats;
      const summary = buildReadingSummary({
        activeMs: activeMsFromStats(
          stats
            ? {
                totalActiveTime: stats.totalActiveTime,
                lastActivityTime: stats.lastActivityTime,
                isActive: stats.currentState === SessionState.ACTIVE,
              }
            : null,
          now,
        ),
        startPercent: start.percent,
        endPercent: latest.percent,
        annotations: Math.max(0, (latest.annotated ?? 0) - (start.annotated ?? latest.annotated ?? 0)),
        lateNight: isLateNight(new Date(now)),
      });
      if (!summary) return;
      toast(summary.title, {
        description: summary.description,
        icon: <img src={NOVA_STATIC_AVATAR} alt="" className="size-6 rounded-full" />,
        duration: 8_000,
      });
    };
  }, [bookId]);
}

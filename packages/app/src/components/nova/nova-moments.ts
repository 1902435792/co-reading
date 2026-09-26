/** Nova 小时刻：纯函数，不依赖 DOM，方便测试。 */

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** 23:00–4:59 算深夜。 */
export function isLateNight(date: Date): boolean {
  const hour = date.getHours();
  return hour >= 23 || hour < 5;
}

export function formatActiveDuration(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / MINUTE);
  if (minutes < 1) return "不到 1 分钟";
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
}

export interface ActiveTimeInput {
  totalActiveTime: number;
  lastActivityTime: number;
  isActive: boolean;
}

/** 和阅读会话的计时逻辑一致：正在阅读时加上距离上次记录的时间。 */
export function activeMsFromStats(stats: ActiveTimeInput | null | undefined, now: number): number {
  if (!stats) return 0;
  const extra = stats.isActive ? Math.max(0, now - stats.lastActivityTime) : 0;
  return Math.max(0, stats.totalActiveTime + extra);
}

/** 整本书的阅读百分比；拿不到时返回 null。 */
export function progressPercent(pageinfo: { current: number; total: number } | null | undefined): number | null {
  if (!pageinfo || !(pageinfo.total > 0)) return null;
  const value = Math.round(((pageinfo.current + 1) / pageinfo.total) * 100);
  return Math.min(100, Math.max(0, value));
}

export interface ReadingSummaryInput {
  activeMs: number;
  startPercent: number | null;
  endPercent: number | null;
  annotations: number;
  lateNight: boolean;
}

export interface ReadingSummary {
  title: string;
  description: string;
}

/** 合书小结：读不到 1 分钟不打扰。 */
export function buildReadingSummary(input: ReadingSummaryInput): ReadingSummary | null {
  if (input.activeMs < MINUTE) return null;
  const parts: string[] = [];
  if (input.startPercent !== null && input.endPercent !== null && input.endPercent > input.startPercent) {
    parts.push(`从 ${input.startPercent}% 读到 ${input.endPercent}%`);
  }
  if (input.annotations > 0) parts.push(`Nova 留了 ${input.annotations} 条边注`);
  if (input.lateNight) parts.push("夜深了，早点休息～");
  else if (input.activeMs >= 90 * MINUTE) parts.push("读了好久，起来走走吧～");
  return {
    title: `和 Nova 一起读了 ${formatActiveDuration(input.activeMs)}`,
    description: parts.join(" · ") || "下次见～",
  };
}

export interface ShelfLineInput {
  status?: "unread" | "reading" | "completed";
  progressCurrent?: number;
  progressTotal?: number;
  lastReadAt?: number;
  completedAt?: number;
  addedAt?: number;
}

/** 书架书卡上 Nova 的一句话；大部分书返回 null，避免满屏都是字。 */
export function getNovaShelfLine(input: ShelfLineInput, now: number): string | null {
  const daysSince = (time?: number) => (time ? (now - time) / DAY : null);

  if (input.status === "completed") {
    const days = daysSince(input.completedAt);
    return days !== null && days <= 7 ? "读完啦！要不要写几句感想？" : null;
  }

  if (input.status === "reading") {
    const idleDays = daysSince(input.lastReadAt);
    if (idleDays !== null && idleDays >= 30) return "好久不见…还记得读到哪了吗？";
    if (idleDays !== null && idleDays >= 3) return `${Math.floor(idleDays)} 天没翻了，它有点寂寞`;
    const total = input.progressTotal ?? 0;
    const percent = total > 0 ? ((input.progressCurrent ?? 0) / total) * 100 : 0;
    if (percent >= 90) return "只差一点点就读完啦！";
    return null;
  }

  const addedDays = daysSince(input.addedAt);
  return addedDays !== null && addedDays <= 3 ? "新书！什么时候一起读？" : null;
}

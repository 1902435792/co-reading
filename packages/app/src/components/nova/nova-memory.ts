// 记忆相关的纯规则：什么时候提议写共读日记、自动共读用的 Profile 是否合适。

export type DiaryTrigger = "close" | "finished" | "chapter-card";

export const DIARY_MIN_ACTIVE_MS = 15 * 60_000;
export const DIARY_MIN_NEW_RECORDS = 3;
/** 同一本书提议过之后，这段时间内不再提（读完一本书除外）。 */
export const DIARY_PROPOSE_COOLDOWN_MS = 6 * 60 * 60_000;

export function shouldProposeDiary(input: {
  trigger: DiaryTrigger;
  unwrittenCount: number;
  activeMs?: number | null;
  lastProposedAt?: number | null;
  now: number;
}): boolean {
  const { trigger, unwrittenCount, activeMs, lastProposedAt, now } = input;
  if (trigger === "finished") return unwrittenCount >= 1;
  if (unwrittenCount < DIARY_MIN_NEW_RECORDS) return false;
  if (lastProposedAt && now - lastProposedAt < DIARY_PROPOSE_COOLDOWN_MS) return false;
  if (trigger === "close") return (activeMs ?? 0) >= DIARY_MIN_ACTIVE_MS;
  return true;
}

export function diaryProposalText(
  trigger: DiaryTrigger,
  unwrittenCount: number,
): { title: string; description: string } {
  const count = `${unwrittenCount} 条还没写进日记的共读记录`;
  if (trigger === "finished") {
    return {
      title: "读完啦！要把这本书的共读写进日记吗？",
      description: `有 ${count}，交给 VCP 整理成一篇日记，以后聊天时我也记得。`,
    };
  }
  if (trigger === "chapter-card") {
    return { title: "顺便写进日记？", description: `这一章读得挺认真，有 ${count}。` };
  }
  return {
    title: "要把今天的共读写进日记吗？",
    description: `这次读得挺久，有 ${count}。写进去以后，我在别处聊天也能想起来。`,
  };
}

export function isVcpBridgeUrl(url?: string | null): boolean {
  return /:3100(\/|$)/.test(url ?? "");
}

/** 这些 Bridge Profile 会接入 OneRing，并带着写日记的指南，不适合批量的自动共读。 */
const HEAVY_PROFILES = new Set(["coreading", "reading", "nova"]);

export interface ProfileAdvice {
  profile: string;
  level: "ok" | "warn";
  message: string;
}

/** 从 `<profile>/<model>` 形式的模型 ID 判断自动共读的 Profile 是否合适；看不出来返回 null。 */
export function coReadingProfileAdvice(modelId?: string | null): ProfileAdvice | null {
  const id = (modelId ?? "").trim();
  const slash = id.indexOf("/");
  if (slash <= 0) return null;
  const profile = id.slice(0, slash);
  if (profile === "coreading-lite") {
    return { profile, level: "ok", message: "自动共读正在用 coreading-lite：只召回阅读日记，不进 OneRing，推荐。" };
  }
  if (HEAVY_PROFILES.has(profile)) {
    return {
      profile,
      level: "warn",
      message: `自动共读用的是「${profile}」Profile：它会接入 OneRing，每批共读都会占用 Nova 的跨端对话账本（只存 100 条），还带着写日记指南。建议改用 coreading-lite/${id.slice(slash + 1)}。`,
    };
  }
  return null;
}

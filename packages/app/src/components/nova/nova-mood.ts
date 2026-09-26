import type { CoReadingStatus } from "@/types/co-reading";
import type { NovaMood } from "./nova-lottie";

/** 多久没有翻页后 Nova 开始打盹。 */
export const NOVA_SLEEP_AFTER_MS = 3 * 60_000;

export interface NovaMoodInput {
  status: CoReadingStatus;
  isProcessing: boolean;
  error: string | null;
  idleMs: number;
  /** 短暂的反应（打招呼、出结果、被摸头等），优先级最高。 */
  reaction: NovaMood | null;
}

export function deriveNovaMood(input: NovaMoodInput): NovaMood {
  if (input.reaction) return input.reaction;
  if (input.error) return "error";
  if (input.status === "paused") return "paused";
  if (input.isProcessing) return "thinking";
  if (input.idleMs >= NOVA_SLEEP_AFTER_MS) return "sleep";
  return "idle";
}

/** 长评论或多条边注时用“恍然大悟”，否则用“说话”。 */
export function getAnnotationReaction(note: string): NovaMood {
  return note.trim().length >= 60 ? "found" : "talking";
}

export const NOVA_LINES: Record<
  "greet" | "thinking" | "silent" | "error" | "sleep" | "paused" | "pet" | "lateGreet" | "lateRest",
  readonly string[]
> = {
  greet: ["一起读《{title}》吧！", "客官请坐～今天读到哪儿啦？", "Nova 已就位，开始共读！"],
  thinking: ["让我仔细读读这一页…", "嗯……这段有点意思", "正在认真做笔记～", "等我一下，马上读完！"],
  silent: ["这页我静静读完啦，继续～", "没什么要补充的，你读得真快！", "嗯嗯，这页记住了。"],
  error: ["呜…这次没读成功", "VCP 好像在忙，我等会儿再试"],
  sleep: ["Zzz…翻页就能叫醒我哦", "有点困了…你还在读吗？"],
  paused: ["共读暂停中，随时叫我～"],
  pet: ["嘿嘿～", "别闹，我在认真读呢！", "再摸就要收费啦（小声）", "最喜欢一起读书了！", "Nova 充电完毕！"],
  lateGreet: ["这么晚还在读呀，Nova 陪你～", "夜读模式开启，别忘了喝口水", "深夜的书最好看，但也要早点睡哦"],
  lateRest: ["已经很晚啦，读完这一节就休息吧？", "眼睛累了吗？闭眼歇一分钟～", "Nova 有点困了…你也早点睡呀"],
};

export function pickNovaLine(kind: keyof typeof NOVA_LINES, seed: number, vars: Record<string, string> = {}): string {
  const lines = NOVA_LINES[kind];
  const line = lines[Math.abs(Math.floor(seed)) % lines.length] ?? "";
  return line.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? "");
}

/** 气泡里的错误文字尽量短。 */
export function shortenNovaText(text: string, max = 90): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

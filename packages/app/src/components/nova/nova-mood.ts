import type { CoReadingStatus } from "@/types/co-reading";
import type { NovaMood } from "./nova-lottie";

/** 多久没有翻页后 Nova 开始打盹。 */
export const NOVA_SLEEP_AFTER_MS = 3 * 60_000;

/** 同一页停留多久后，「卡住探头」问一句要不要帮忙。 */
export const NOVA_STUCK_AFTER_MS = 90_000;

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
  "greet" | "thinking" | "silent" | "error" | "sleep" | "paused" | "pet" | "lateGreet" | "lateRest" | "stuck",
  readonly string[]
> = {
  greet: [
    "一起读《{title}》吧！",
    "客官请坐～今天读到哪儿啦？",
    "Nova 已就位，开始共读！",
    "书签我替你守着呢，接着读《{title}》？",
    "茶泡好了，书也翻开了，开读～",
    "又见面啦！上次读到的地方我还记得哦",
    "今天也请多指教，共读搭子上线！",
    "《{title}》，冲鸭！",
    "准备好小本本了，你读，我记～",
    "欢迎回来！今天想慢慢读还是一口气读？",
  ],
  thinking: [
    "让我仔细读读这一页…",
    "嗯……这段有点意思",
    "正在认真做笔记～",
    "等我一下，马上读完！",
    "这句话我得多读两遍…",
    "咦，这里好像和前面对上了？",
    "脑内小算盘噼里啪啦中…",
    "我在找这段的弦外之音～",
    "先别翻页，我快想明白了！",
    "划重点中，请稍候～",
  ],
  silent: [
    "这页我静静读完啦，继续～",
    "没什么要补充的，你读得真快！",
    "嗯嗯，这页记住了。",
    "这页很顺，不打扰你啦",
    "安静读书的时间也很好呀",
    "这一段就交给你自己品味～",
    "我在旁边喝口茶，你继续",
    "这页没有要吐槽的，难得！",
    "读得好专注，我都不忍心打断",
  ],
  error: [
    "呜…这次没读成功",
    "VCP 好像在忙，我等会儿再试",
    "脑子短路了一下，马上恢复！",
    "网线好像打了个结…再试一次？",
    "这页没接住，我去捡回来",
    "举白旗…稍后我再战！",
    "出了点小状况，不是你的错哦",
  ],
  sleep: [
    "Zzz…翻页就能叫醒我哦",
    "有点困了…你还在读吗？",
    "Nova 进入省电模式…",
    "梦里也在读书…Zzz",
    "我先眯一会儿，有事翻页叫我",
    "是不是去泡茶啦？我等你～",
    "呼……这一页好长的休息",
  ],
  paused: [
    "共读暂停中，随时叫我～",
    "我去摸会儿鱼，要继续就喊我",
    "暂停啦，想聊书也可以点我",
    "休息一下也好，书又不会跑",
    "躺平待命中～",
    "等你回来继续哦",
  ],
  pet: [
    "嘿嘿～",
    "别闹，我在认真读呢！",
    "再摸就要收费啦（小声）",
    "最喜欢一起读书了！",
    "Nova 充电完毕！",
    "头发要被摸乱啦！",
    "……再、再摸一下也不是不行",
    "你是不是读累了？我给你加油！",
    "哼，才不是因为开心才脸红的",
    "抱抱～然后继续读书！",
    "投喂一颗星星给你 ⭐",
  ],
  lateGreet: [
    "这么晚还在读呀，Nova 陪你～",
    "夜读模式开启，别忘了喝口水",
    "深夜的书最好看，但也要早点睡哦",
    "夜深了，书页好像更安静了",
    "夜猫子读书会，成员两名！",
    "灯光调暗一点，眼睛会舒服些",
  ],
  lateRest: [
    "已经很晚啦，读完这一节就休息吧？",
    "眼睛累了吗？闭眼歇一分钟～",
    "Nova 有点困了…你也早点睡呀",
    "明天再读也来得及，书会等你的",
    "再熬夜就要变成熊猫眼啦",
    "晚安预备～读完这页就睡？",
  ],
  stuck: [
    "这页有点绕？要我帮你拆一下吗",
    "在这儿停了好一会儿，是不是卡住了？",
    "这段信息量有点大，需要我讲讲吗？",
    "要不要我把这段翻译成人话？",
    "卡住的地方选中问我就行～",
    "这一页值得多停一会儿，想聊聊吗？",
    "我也觉得这里不好懂，一起啃？",
  ],
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

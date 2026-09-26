/** 「问 Nova」：提示词和回答清理，纯函数。 */

export type NovaAskAction = "explain" | "challenge" | "connect" | "summary" | "unstuck";

/** 拖文字 / 选中文字后弹出的菜单顺序。 */
export const NOVA_ASK_MENU: readonly NovaAskAction[] = ["explain", "challenge", "connect", "summary"];

export const NOVA_ASK_ACTIONS: Record<NovaAskAction, { label: string; instruction: string; thinking: string }> = {
  explain: {
    label: "解释一下",
    instruction: "用通俗的话解释这段在说什么，以及它为什么重要。",
    thinking: "我想想怎么讲清楚…",
  },
  challenge: {
    label: "反驳我",
    instruction: "站在反方，指出这段说法可能的漏洞、反例或值得怀疑的地方，语气友好但要有观点。",
    thinking: "嘿嘿，让我来唱唱反调…",
  },
  connect: {
    label: "联想一下",
    instruction: "联想到其他书、作者、理论或现实中的相似例子，说清楚它们之间的联系。",
    thinking: "这让我想起了一些东西…",
  },
  summary: {
    label: "一句话总结",
    instruction: "用一句话（不超过 40 字）概括这段的核心意思。",
    thinking: "浓缩一下…",
  },
  unstuck: {
    label: "帮你拆一下",
    instruction: "读者在这一页停留了很久，可能卡住了。找出最难懂的一两处，用通俗的话拆解，必要时补充背景知识。",
    thinking: "我们一起看看这页哪里绕…",
  },
};

export const NOVA_ASK_MAX_CHARS = 1_500;

export function clipNovaAskText(text: string, max = NOVA_ASK_MAX_CHARS): string {
  const clean = text.replace(/\s+\n/g, "\n").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export interface NovaAskPromptInput {
  action: NovaAskAction;
  text: string;
  bookTitle?: string;
  sectionLabel?: string;
}

export function buildNovaAskPrompt(input: NovaAskPromptInput): { system: string; prompt: string } {
  const book = input.bookTitle ? `《${input.bookTitle}》` : "这本书";
  const system = [
    `你是 Nova，正在和读者一起读${book}的伙伴。`,
    "用亲切、口语化的简体中文回答，像朋友聊天。",
    "一般不超过 180 字；不要用 Markdown 标题、加粗或列表符号；只依据给出的文字和常识，不剧透后文。",
  ].join("");
  const lines = [
    input.sectionLabel ? `章节：${input.sectionLabel}` : "",
    "读者选中的文字：",
    `"""${clipNovaAskText(input.text)}"""`,
    "",
    `任务：${NOVA_ASK_ACTIONS[input.action].instruction}`,
  ].filter((line, index) => index > 0 || line);
  return { system, prompt: lines.join("\n") };
}

/** 去掉模型偶尔加上的 Markdown 记号，限制长度。 */
export function cleanNovaAnswer(text: string, max = 800): string {
  const clean = text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

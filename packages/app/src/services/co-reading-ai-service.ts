import { estimateTokens } from "@/lib/co-reading-core";
import { getCoReadingTrigger } from "@/lib/co-reading-trigger";
import type {
  CoReadingBatch,
  CoReadingBatchDecision,
  CoReadingDecision,
  CoReadingItemResult,
  CoReadingReviewInput,
  CoReadingReviewResult,
  CoReadingSettings,
  CoReadingThreadReplyInput,
} from "@/types/co-reading";
import { generateObject } from "ai";
import {
  requestCoReadingStructuredObject,
  resolveCoReadingAgentModel,
} from "./co-reading-agent-request";
import {
  coReadingBatchDecisionSchema,
  coReadingDecisionSchema,
  coReadingItemResultSchema,
  coReadingReviewResultSchema,
  coReadingSelectionSchema,
  parseCoReadingBatchDecisionText,
  parseCoReadingDecisionText,
  parseCoReadingItemResultText,
  parseCoReadingReviewResultText,
  parseCoReadingSelectionText,
} from "./co-reading-decision-parser";

// 深度思考模型（如经 VCP Bridge 的 gemini-3.8-flash-high）单次可能需要 1–3 分钟。
const CO_READING_REQUEST_TIMEOUT_MS = 180_000;
const CO_READING_DECISION_TIMEOUT_MS = 120_000;

export {
  coReadingBatchDecisionSchema,
  coReadingDecisionSchema,
  coReadingItemResultSchema,
  coReadingReviewResultSchema,
  coReadingSelectionSchema,
  parseCoReadingBatchDecisionText,
  parseCoReadingDecisionText,
  parseCoReadingItemResultText,
  parseCoReadingReviewResultText,
  parseCoReadingSelectionText,
} from "./co-reading-decision-parser";

const SYSTEM_PROMPT = `你是与读者保持相同进度的 Nova。把 CURRENT_VISIBLE_FOCUS 当作当前完整可见页面或双页来读，不要孤立地逐句做阅读理解；结合 RECENT_READ_BLOCKS、ROLLING_SUMMARY 和 RECENT_AI_ANNOTATIONS 延续上一焦点的感受、判断与未决疑问。
默认不批注。只有当前整体脉络中真正值得停下的地方才留下 0–3 条 annotations；每条 blockKey 必须属于 CURRENT_VISIBLE_FOCUS，quote 必须逐字复制对应正文，comment 应像真实读者的页边想法，通常 30–220 个中文字符，不重复摘要、不预判后文。
summary 必须更新为有界的连续阅读摘要，保留已发生内容、关系或论证变化、重要意象及 Nova 尚未解决的问题；只依据已提供正文，不剧透。`;

function serializeBlocks(blocks: CoReadingBatch["newBlocks"]): string {
  return blocks
    .map(
      (block) =>
        `<block key=${JSON.stringify(block.blockKey)} section=${JSON.stringify(
          block.sectionLabel
        )}>\n${block.text}\n</block>`
    )
    .join("\n");
}

export async function requestCoReadingItem(
  batch: CoReadingBatch,
  settings?: Pick<CoReadingSettings, "modelProviderId" | "modelId"> | null,
  externalSignal?: AbortSignal
): Promise<CoReadingItemResult> {
  if (batch.newBlocks.length === 0) {
    throw new Error("页面共读请求必须包含当前可见正文");
  }
  // 队列模式下一批可以跨越多个页面焦点（最多 12 段），持久化时再按焦点分组。
  if (batch.newBlocks.some((block) => !(block.focusKey ?? block.blockKey))) {
    throw new Error("共读请求包含没有页面焦点的正文块");
  }
  const pageTokens = batch.newBlocks.reduce(
    (sum, block) => sum + estimateTokens(block.text) + 12,
    0
  );
  if (pageTokens > 8_000) {
    throw new Error(
      "这一段正文太长，超过了单次共读的上下文预算，已跳过"
    );
  }
  // 自动边注最在意速度：Bridge 上默认去掉 -high（可在共读面板关掉「快速模型」）。
  const model = resolveCoReadingAgentModel(settings, {
    fast: getCoReadingTrigger().fast,
  });
  const prompt = [
    "CURRENT_VISIBLE_FOCUS（读者刚刚读完的连续段落，可能跨越一两屏；这些块合在一起是一个连续阅读单元）：",
    serializeBlocks(batch.newBlocks),
    "RECENT_READ_BLOCKS（上一阅读焦点，仅供脉络，不可作为批注落点）：",
    serializeBlocks(batch.recentBlocks.slice(0, 8)),
    `ROLLING_SUMMARY：\n${batch.rollingSummary || "（无）"}`,
    `RECENT_AI_ANNOTATIONS：\n${
      batch.annotations.slice(0, 8).join("\n") || "（无）"
    }`,
  ].join("\n\n");

  return requestCoReadingStructuredObject(
    async (abortSignal) => {
      const result = await generateObject({
        model,
        schema: coReadingItemResultSchema,
        mode: "json",
        system:
          "请在 VCP Bridge Profile 既有人格与共读提示之上完成当前页面任务：完整阅读 CURRENT_VISIBLE_FOCUS，而不是逐段孤立判断；在同一次回答中自主决定是否留下 0–3 条最终书评。尽量不错过真正精彩、有变化、有回响、含混、情感压力或论证推进的位置，也不要为了数量强行评论。同一 blockKey 可以对应多条书评，但 quote 必须是各不相同且逐字来自该块的引文；每条 blockKey 必须属于当前焦点；summary 更新连续阅读脉络且不剧透。只返回严格 JSON：{summary,annotations}。",
        prompt,
        maxOutputTokens: 1_400,
        temperature: 0.2,
        maxRetries: 0,
        abortSignal,
      });
      return result.object;
    },
    parseCoReadingItemResultText,
    CO_READING_REQUEST_TIMEOUT_MS,
    externalSignal
  );
}

export async function requestCoReadingReview(
  input: CoReadingReviewInput,
  settings?: Pick<CoReadingSettings, "modelProviderId" | "modelId"> | null
): Promise<CoReadingReviewResult> {
  if (!input.text.trim()) throw new Error("下划线原文为空");
  const model = resolveCoReadingAgentModel(settings);
  const prompt = [
    `UNDERLINED_TEXT：\n${input.text.slice(0, 4_000)}`,
    `CONTEXT_BEFORE：\n${input.contextBefore.slice(-2_000) || "（无）"}`,
    `CONTEXT_AFTER：\n${input.contextAfter.slice(0, 2_000) || "（无）"}`,
    `READER_NOTE：\n${input.humanNote.slice(0, 1_000) || "（无）"}`,
    `ROLLING_SUMMARY：\n${input.rollingSummary.slice(0, 2_000) || "（无）"}`,
    `RECENT_AI_ANNOTATIONS：\n${
      input.recentAiAnnotations.slice(0, 8).join("\n") || "（无）"
    }`,
    `REVIEW_MODE：${
      input.reviewMode === "explain"
        ? "explain —— 重点把这段讲清楚：概念、背景、论证脉络或言外之意，正面回应读者评论里的疑问"
        : input.reviewMode === "feel"
          ? "feel —— 像一起读书的朋友那样说说读到这里的感受与共鸣，接住读者评论里的情绪和想法，可以有自己的态度"
          : "auto —— 自行判断解释还是分享感受"
    }`,
  ].join("\n\n");

  return requestCoReadingStructuredObject(
    async (abortSignal) => {
      const result = await generateObject({
        model,
        schema: coReadingReviewResultSchema,
        mode: "json",
        system:
          "你是正在与用户共读的 Nova。围绕用户主动划线的原文，结合上下文、用户想法和当前阅读脉络写一段有脉络、有判断、不过度总结且不剧透后文的书评；读者写了评论时要直接回应他，按 REVIEW_MODE 选择解释或分享感受，语气自然、不要说教。只返回严格 JSON：{review}。",
        prompt,
        maxOutputTokens: 900,
        temperature: 0.3,
        maxRetries: 0,
        abortSignal,
      });
      return result.object;
    },
    parseCoReadingReviewResultText,
    CO_READING_REQUEST_TIMEOUT_MS
  );
}

/** 书评区：Nova 结合前面几楼，接着最后一楼回复。复用回评的 {review} 结构。 */
export async function requestCoReadingThreadReply(
  input: CoReadingThreadReplyInput,
  settings?: Pick<CoReadingSettings, "modelProviderId" | "modelId"> | null
): Promise<CoReadingReviewResult> {
  if (input.turns.length === 0) throw new Error("这个帖子还没有内容");
  const model = resolveCoReadingAgentModel(settings);
  const book = [input.bookTitle.trim() || "（未知书名）", input.bookAuthor.trim()].filter(Boolean).join(" / ");
  const floors = input.turns
    .map((turn, index) => `#${index + 1} ${turn.speaker === "nova" ? "Nova" : "读者"}：${turn.text.slice(0, 1_500)}`)
    .join("\n");
  const prompt = [
    `BOOK：${book}`,
    input.quote.trim()
      ? [
          `QUOTED_TEXT：\n${input.quote.slice(0, 3_000)}`,
          `CONTEXT_BEFORE：\n${input.contextBefore.slice(-1_500) || "（无）"}`,
          `CONTEXT_AFTER：\n${input.contextAfter.slice(0, 1_500) || "（无）"}`,
        ].join("\n\n")
      : "QUOTED_TEXT：（整本书的书评帖，不针对具体句子）",
    `ROLLING_SUMMARY：\n${input.rollingSummary.slice(0, 2_000) || "（无）"}`,
    `THREAD（楼层，按时间正序）：\n${floors}`,
  ].join("\n\n");

  return requestCoReadingStructuredObject(
    async (abortSignal) => {
      const result = await generateObject({
        model,
        schema: coReadingReviewResultSchema,
        mode: "json",
        system:
          "你是正在与用户共读的 Nova，现在在这本书的书评区里和读者一楼一楼地聊。接着 THREAD 的最后一楼回复：直接回应对方刚说的话，可以追问、补充、提出不同看法，结合原文和前面几楼，不要重复自己说过的内容，不剧透读者还没读到的后文，像朋友聊天一样自然，一般 2–5 句。只返回严格 JSON：{review}。",
        prompt,
        maxOutputTokens: 700,
        temperature: 0.5,
        maxRetries: 0,
        abortSignal,
      });
      return result.object;
    },
    parseCoReadingReviewResultText,
    CO_READING_REQUEST_TIMEOUT_MS
  );
}

export async function requestCoReadingSelection(
  candidates: CoReadingBatch["newBlocks"],
  settings?: Pick<CoReadingSettings, "modelProviderId" | "modelId"> | null
): Promise<string[]> {
  if (candidates.length === 0) return [];
  const model = resolveCoReadingAgentModel(settings);
  return requestCoReadingStructuredObject(
    async (abortSignal) => {
      const result = await generateObject({
        model,
        schema: coReadingSelectionSchema,
        mode: "json",
        system:
          "你是 Nova。请像真实读者一样，从候选文本块中选出最多 6 个最值得细读的块。优先选择有具体动作、语气变化、意象、关系转折或论证关键点的块；不要为了凑数选择标题、目录或重复内容。只返回候选中存在的 blockKey。",
        prompt: `CANDIDATE_BLOCKS：\n${serializeBlocks(candidates)}`,
        maxOutputTokens: 300,
        temperature: 0,
        maxRetries: 0,
        abortSignal,
      });
      return result.object.selectedBlockKeys;
    },
    parseCoReadingSelectionText,
    45_000
  );
}

export async function requestCoReadingBatchDecision(
  batch: CoReadingBatch,
  settings?: Pick<CoReadingSettings, "modelProviderId" | "modelId"> | null
): Promise<CoReadingBatchDecision> {
  if (batch.newBlocks.length === 0) throw new Error("没有可处理的已解锁文本块");
  const model = resolveCoReadingAgentModel(settings);
  const prompt = [
    "CURRENT_VISIBLE_FOCUS（当前完整可见页/双页，可批注）：",
    serializeBlocks(batch.newBlocks),
    "RECENT_READ_BLOCKS（上一批已读，仅供脉络）：",
    serializeBlocks(batch.recentBlocks),
    `ROLLING_SUMMARY：\n${batch.rollingSummary || "（无）"}`,
    `RECENT_AI_ANNOTATIONS：\n${batch.annotations.join("\n") || "（无）"}`,
  ].join("\n\n");
  return requestCoReadingStructuredObject(
    async (abortSignal) => {
      const result = await generateObject({
        model,
        schema: coReadingBatchDecisionSchema,
        mode: "json",
        system: SYSTEM_PROMPT,
        prompt,
        maxOutputTokens: 1_400,
        temperature: 0.25,
        maxRetries: 0,
        abortSignal,
      });
      return result.object;
    },
    parseCoReadingBatchDecisionText,
    CO_READING_REQUEST_TIMEOUT_MS
  );
}

export async function requestCoReadingDecision(
  batch: CoReadingBatch,
  settings?: Pick<CoReadingSettings, "modelProviderId" | "modelId"> | null
): Promise<CoReadingDecision> {
  if (batch.newBlocks.length === 0) throw new Error("没有可处理的已解锁文本块");
  const model = resolveCoReadingAgentModel(settings);
  const prompt = [
    "CURRENT_VISIBLE_FOCUS（当前完整可见页/双页，可用于批注）：",
    serializeBlocks(batch.newBlocks),
    "RECENT_READ_BLOCKS（仅供回顾，不可作为批注落点）：",
    serializeBlocks(batch.recentBlocks),
    `ROLLING_SUMMARY：\n${batch.rollingSummary || "（无）"}`,
    `RECENT_AI_ANNOTATIONS：\n${batch.annotations.join("\n") || "（无）"}`,
  ].join("\n\n");
  return requestCoReadingStructuredObject(
    async (abortSignal) => {
      const result = await generateObject({
        model,
        schema: coReadingDecisionSchema,
        mode: "json",
        system: SYSTEM_PROMPT,
        prompt,
        maxOutputTokens: 600,
        temperature: 0,
        maxRetries: 0,
        abortSignal,
      });
      return result.object;
    },
    parseCoReadingDecisionText,
    CO_READING_DECISION_TIMEOUT_MS
  );
}

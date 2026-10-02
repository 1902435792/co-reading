import type { CoReadingDiaryPayload } from "./co-reading-diary.ts";

export const CO_READING_DIARY_PATH = "/v1/deepreader-coreading-diary";

export function resolveCoReadingDiaryEndpoint(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) throw new Error("当前问答 Agent 模型缺少可用的服务地址");
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("当前问答 Agent 模型的服务地址无效");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("当前问答 Agent 模型的服务地址必须使用 HTTP(S)");
  }
  url.pathname = CO_READING_DIARY_PATH;
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function buildCoReadingDiaryRequest(
  payload: CoReadingDiaryPayload,
  model: string,
): CoReadingDiaryPayload & { model: string } {
  const modelId = model.trim();
  if (!modelId) throw new Error("当前问答 Agent 模型缺少可用的模型 ID");
  if (payload.selectedCount !== payload.entries.length) {
    throw new Error("共读 Agent 记录数与内容不一致");
  }
  if (payload.sourceKeys.length !== payload.entries.length) {
    throw new Error("共读 Agent 来源标识与内容不一致");
  }
  return { ...payload, model: modelId };
}

/**
 * 对方的 Bridge 没有日记专用路由（返回 404）时，改走普通的 /chat/completions：
 * 用 deepreader-coreading-diary Profile，把同样的请求 JSON 当作用户消息发过去。
 * 显式触发标志由这里补上（专用路由原本由服务端补）。
 */
export function resolveChatCompletionsEndpoint(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/u, "");
  if (!trimmed) throw new Error("当前问答 Agent 模型缺少可用的服务地址");
  return `${trimmed}/chat/completions`;
}

export function buildCoReadingDiaryFallbackRequest(
  payload: CoReadingDiaryPayload,
  model: string,
  profile: string,
): { model: string; stream: false; messages: Array<{ role: "user"; content: string }> } {
  // 先走和专用路由同样的校验（条数、来源一致）。
  const checked = buildCoReadingDiaryRequest(payload, model);
  const slash = checked.model.indexOf("/");
  const base = slash > 0 ? checked.model.slice(slash + 1) : checked.model;
  return {
    model: `${profile}/${base}`,
    stream: false,
    messages: [{ role: "user", content: JSON.stringify({ userExplicitlyTriggered: true, ...payload }) }],
  };
}

export function buildCoReadingDiaryHeaders(apiKey: string): Record<string, string> {
  const providerApiKey = apiKey.trim();
  if (!providerApiKey) throw new Error("当前问答 Agent 模型缺少可用的 API Key");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${providerApiKey}`,
  };
}

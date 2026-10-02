import type { CoReadingDiaryPayload } from "@/lib/co-reading-diary";
import { DEEPREADER_DIARY_PROFILE, bridgeModelIdFor } from "@/components/settings/vcp-bridge-models";
import {
  buildCoReadingDiaryFallbackRequest,
  buildCoReadingDiaryHeaders,
  buildCoReadingDiaryRequest,
  resolveChatCompletionsEndpoint,
  resolveCoReadingDiaryEndpoint,
} from "@/lib/co-reading-diary-request";
import {
  parseConfirmedVcpCoReadingDiaryResponse,
  parseVcpChatDiaryResponse,
  type VcpCoReadingDiaryResponse,
} from "@/lib/co-reading-diary-response";
import { markCoReadingDiaryWritten } from "@/services/co-reading-service";
import { useProviderStore } from "@/store/provider-store";
import { fetch as fetchTauri } from "@tauri-apps/plugin-http";

const CO_READING_DIARY_TIMEOUT_MS = 120_000;

export interface CoReadingDiaryWriteResult {
  message: string;
  diaryId: string;
  writtenCount: number;
}

/**
 * 把整理好的日记条目发给 VCP Bridge 的日记接口（共读日记和问答日记共用）。
 * 只负责发送和解析确认，不动本地账本。
 */
export async function postVcpDiaryPayload(payload: CoReadingDiaryPayload) {
  const state = useProviderStore.getState();
  const selected = state.selectedModel;
  if (!selected) throw new Error("请先在问答 Agent 中选择可用模型");

  const provider = state.modelProviders.find((item) => item.provider === selected.providerId && item.active);
  const model = provider?.models.find((item) => item.id === selected.modelId && item.active !== false);
  const baseUrl = provider?.baseUrl?.trim();
  const apiKey = provider?.apiKey?.trim();
  if (!provider || !model || !baseUrl || !apiKey) {
    throw new Error("问答 Agent 当前模型不可用，或缺少服务地址/API Key");
  }

  // 日记接口自己带 Profile：只发基础模型名。
  const baseModel = bridgeModelIdFor(selected.modelId, "diary", { profileSet: provider.vcpProfileSet });
  const response = await fetchTauri(resolveCoReadingDiaryEndpoint(baseUrl), {
    method: "POST",
    headers: buildCoReadingDiaryHeaders(apiKey),
    body: JSON.stringify(buildCoReadingDiaryRequest(payload, baseModel)),
    signal: AbortSignal.timeout(CO_READING_DIARY_TIMEOUT_MS),
  });
  // 对方的 Bridge 没有日记专用路由：改走普通通道（deepreader-coreading-diary Profile）。
  if (response.status === 404 || response.status === 405) {
    return postDiaryViaProfile(payload, baseUrl, apiKey, baseModel);
  }
  const body = (await response.json().catch(() => null)) as VcpCoReadingDiaryResponse | null;

  if (!response.ok) {
    throw new Error(body?.error?.message?.trim() || `VCP 共读 Agent 写入失败（HTTP ${response.status}）`);
  }
  return parseConfirmedVcpCoReadingDiaryResponse(body);
}

async function postDiaryViaProfile(payload: CoReadingDiaryPayload, baseUrl: string, apiKey: string, baseModel: string) {
  const response = await fetchTauri(resolveChatCompletionsEndpoint(baseUrl), {
    method: "POST",
    headers: buildCoReadingDiaryHeaders(apiKey),
    body: JSON.stringify(buildCoReadingDiaryFallbackRequest(payload, baseModel, DEEPREADER_DIARY_PROFILE)),
    signal: AbortSignal.timeout(CO_READING_DIARY_TIMEOUT_MS),
  });
  const body = (await response.json().catch(() => null)) as VcpCoReadingDiaryResponse | null;
  if (!response.ok) {
    const reason = body?.error?.message?.trim();
    throw new Error(
      reason
        ? `写日记失败：${reason}（Bridge 没有日记专用接口，已改用 ${DEEPREADER_DIARY_PROFILE} Profile；请确认已用「一键配置 VCP」写入它）`
        : `写日记失败（HTTP ${response.status}）：Bridge 没有日记专用接口，改用 ${DEEPREADER_DIARY_PROFILE} Profile 也没成功，请确认已用「一键配置 VCP」写入它`,
    );
  }
  // 普通通道没有专用路由那层严格确认：要求有回复内容和服务端请求 ID，并提醒用户核对。
  const result = parseVcpChatDiaryResponse(body);
  return { ...result, message: `${result.message}\n\n（经普通通道写入，没有专用接口的确认；请到日记本里核对一下。）` };
}

export async function createCoReadingDiary(
  bookId: string,
  payload: CoReadingDiaryPayload,
): Promise<CoReadingDiaryWriteResult> {
  // Parsing must succeed before touching the local ledger. In particular, a
  // malformed 2xx response must not be upgraded into success by a local ID.
  const confirmed = await postVcpDiaryPayload(payload);
  try {
    const ledger = await markCoReadingDiaryWritten({
      bookId,
      diaryId: confirmed.diaryId,
      sourceKeys: payload.sourceKeys,
    });
    return {
      message: confirmed.message,
      diaryId: ledger.diaryId,
      writtenCount: ledger.writtenCount,
    };
  } catch (error) {
    throw new Error(
      `VCP 已返回写入成功，但本地来源账本更新失败；请先刷新记录，避免立即重复写入。${
        error instanceof Error ? ` ${error.message}` : ""
      }`,
      { cause: error },
    );
  }
}

export interface VcpCoReadingDiaryResponse {
  status?: string;
  generationSucceeded?: boolean;
  dailyNoteWritten?: boolean;
  id?: string;
  requestId?: string;
  diaryId?: string;
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

export interface ConfirmedVcpCoReadingDiaryResponse {
  diaryId: string;
  message: string;
}

/**
 * Requires both a non-empty VCP completion and a server-confirmed request or
 * diary identity. The local ledger must never be advanced from a guessed ID.
 */
export function parseConfirmedVcpCoReadingDiaryResponse(
  body: VcpCoReadingDiaryResponse | null,
): ConfirmedVcpCoReadingDiaryResponse {
  const message = body?.choices?.[0]?.message?.content?.trim();
  if (!body || !message) {
    throw new Error("VCP 共读 Agent 未返回明确的写入结果");
  }
  if (body.status !== "success" || body.generationSucceeded !== true || body.dailyNoteWritten !== true) {
    throw new Error("VCP 共读 Agent 未明确确认日记生成与 DailyNote 写入均成功");
  }

  const diaryId = body.diaryId?.trim() || body.requestId?.trim() || body.id?.trim();
  if (!diaryId) {
    throw new Error("VCP 共读 Agent 未返回可确认的日记/请求 ID");
  }

  return { diaryId, message };
}

/**
 * 普通通道（/chat/completions + deepreader-coreading-diary Profile）的结果：
 * 没有专用路由那三个确认标志，只能要求有回复内容和服务端给的请求 ID（不自己编 ID）。
 * 调用方要提醒用户到日记本里核对。
 */
export function parseVcpChatDiaryResponse(body: VcpCoReadingDiaryResponse | null): ConfirmedVcpCoReadingDiaryResponse {
  const message = body?.choices?.[0]?.message?.content?.trim();
  if (!body || !message) {
    throw new Error("VCP 没有返回日记内容，可能没有写入");
  }
  const diaryId = body.id?.trim() || body.requestId?.trim() || body.diaryId?.trim();
  if (!diaryId) {
    throw new Error("VCP 没有返回请求 ID，无法确认这次写入");
  }
  return { diaryId, message };
}

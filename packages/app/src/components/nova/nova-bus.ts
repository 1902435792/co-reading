import type { NovaAskAction } from "./nova-ask";

/** 从阅读页其他地方（选中文字弹条等）把文字交给 Nova。 */
export interface NovaAskRequest {
  text: string;
  /** 不填时让 Nova 弹出菜单，由读者选择要做什么。 */
  action?: NovaAskAction;
}

type NovaAskHandler = (request: NovaAskRequest) => void;

const handlers = new Map<string, NovaAskHandler>();

export function registerNovaAsker(bookId: string, handler: NovaAskHandler): () => void {
  handlers.set(bookId, handler);
  return () => {
    if (handlers.get(bookId) === handler) handlers.delete(bookId);
  };
}

/** Nova 不在场（共读关闭或 Nova 被隐藏）时返回 false，调用方自己兜底。 */
export function askNova(bookId: string | null | undefined, request: NovaAskRequest): boolean {
  if (!bookId || !request.text.trim()) return false;
  const handler = handlers.get(bookId);
  if (!handler) return false;
  handler(request);
  return true;
}

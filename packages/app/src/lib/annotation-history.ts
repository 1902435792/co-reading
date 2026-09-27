import type { BookNote } from "../types/book.ts";

/**
 * 阅读页划线/高亮的撤销与重做（Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z）。
 * 每本书一条历史；这里只管记账，真正的增删由调用方完成。
 */
export type AnnotationChange =
  | { kind: "create"; note: BookNote; linked?: BookNote[] }
  | { kind: "delete"; note: BookNote; linked?: BookNote[] };

interface History {
  undo: AnnotationChange[];
  redo: AnnotationChange[];
}

const LIMIT = 50;
const histories = new Map<string, History>();

function historyOf(bookId: string): History {
  let history = histories.get(bookId);
  if (!history) {
    history = { undo: [], redo: [] };
    histories.set(bookId, history);
  }
  return history;
}

/** 用户的新操作：进入撤销栈，并清空重做栈。 */
export function recordAnnotationChange(bookId: string, change: AnnotationChange) {
  const history = historyOf(bookId);
  history.undo.push(change);
  if (history.undo.length > LIMIT) history.undo.shift();
  history.redo = [];
}

export function takeUndo(bookId: string): AnnotationChange | undefined {
  return historyOf(bookId).undo.pop();
}

export function takeRedo(bookId: string): AnnotationChange | undefined {
  return historyOf(bookId).redo.pop();
}

/** 撤销完成后把（可能换了 id 的）操作放进重做栈。 */
export function pushRedo(bookId: string, change: AnnotationChange) {
  historyOf(bookId).redo.push(change);
}

/** 重做完成后放回撤销栈（不清空重做栈）。 */
export function pushUndo(bookId: string, change: AnnotationChange) {
  const history = historyOf(bookId);
  history.undo.push(change);
  if (history.undo.length > LIMIT) history.undo.shift();
}

export function clearAnnotationHistory(bookId: string) {
  histories.delete(bookId);
}

export function undoKeyAction(event: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): "undo" | "redo" | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (key === "z") return event.shiftKey ? "redo" : "undo";
  if (key === "y" && !event.shiftKey) return "redo";
  return null;
}

/** 焦点在输入框、文本域或可编辑区域时不拦截 Ctrl+Z，交给输入框自己撤销文字。 */
export function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as { tagName?: string; isContentEditable?: boolean } | null;
  if (!element || typeof element.tagName !== "string") return false;
  const tag = element.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || element.isContentEditable === true;
}

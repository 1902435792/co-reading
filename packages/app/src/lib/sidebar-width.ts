// 两个侧栏的宽度上限：保证正文区至少留出一块，侧栏不会被挤出屏幕（平板竖屏两栏都开时）。
// 纯逻辑，不依赖 React，方便单元测试。

export interface SidebarBounds {
  min: number;
  max: number;
}

export const NOTEPAD_BOUNDS: SidebarBounds = { min: 260, max: 500 };
export const CHAT_BOUNDS: SidebarBounds = { min: 320, max: 580 };
/** 两栏都开时按默认宽度 300 : 370 分配剩余空间。 */
const NOTEPAD_SHARE = 300 / 670;

/** 正文区最少保留的宽度：容器的 40%，夹在 240–420 之间。 */
export function readerMinWidth(containerWidth: number): number {
  return Math.round(Math.min(420, Math.max(240, containerWidth * 0.4)));
}

function clampBounds(bounds: SidebarBounds, cap: number): SidebarBounds {
  const max = Math.max(0, Math.min(bounds.max, Math.floor(cap)));
  return { min: Math.min(bounds.min, max), max };
}

/**
 * 按容器宽度算出两个侧栏各自允许的最小 / 最大宽度。
 * 容器宽度未知（0）时返回原始范围。
 */
export function sidebarBounds(
  containerWidth: number,
  notepadOpen: boolean,
  chatOpen: boolean,
): { notepad: SidebarBounds; chat: SidebarBounds } {
  if (!(containerWidth > 0)) return { notepad: NOTEPAD_BOUNDS, chat: CHAT_BOUNDS };
  const budget = Math.max(0, containerWidth - readerMinWidth(containerWidth));
  if (notepadOpen && chatOpen) {
    // 按比例切，两栏上限之和不超过预算：不管怎么拖都不会把另一栏挤出屏幕。
    const notepadCap = Math.floor(budget * NOTEPAD_SHARE);
    const chatCap = budget - notepadCap;
    return { notepad: clampBounds(NOTEPAD_BOUNDS, notepadCap), chat: clampBounds(CHAT_BOUNDS, chatCap) };
  }
  return { notepad: clampBounds(NOTEPAD_BOUNDS, budget), chat: clampBounds(CHAT_BOUNDS, budget) };
}

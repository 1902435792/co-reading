import { PHONE_MAX_WIDTH } from "@/hooks/use-is-phone";
import { INK_TIP_CLOSE, PHONE_CHROME_CLOSE } from "@/lib/phone-reader";
import { useAppSettingsStore } from "@/store/app-settings-store";
import { useImmersiveStore } from "@/store/immersive-store";
import { useLayoutStore } from "@/store/layout-store";

/**
 * 安卓返回键 / 返回手势：由 MainActivity 调用 window.__deepreaderBack()。
 * 按顺序关掉最上面的一层；返回 true 表示处理了，false 表示已经没东西可关（App 退到后台，不结束）。
 */
export function handleAndroidBack(): boolean {
  // 0. 书里的划线 / 评论菜单：收起菜单和选区
  const selectionPopup = Array.from(document.querySelectorAll<HTMLElement>(".selection-popup")).find(
    (el) => el.offsetParent !== null && getComputedStyle(el).visibility !== "hidden",
  );
  if (selectionPopup) {
    window.dispatchEvent(new Event("deepreader-dismiss-selection"));
    return true;
  }
  // 1. 弹窗 / 下拉菜单（Radix）：模拟 Esc 关掉
  const layer = document.querySelector(
    '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"], [data-radix-popper-content-wrapper]',
  );
  if (layer) {
    const esc = { key: "Escape", code: "Escape", keyCode: 27, bubbles: true, cancelable: true };
    (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", esc));
    return true;
  }
  // 1.5 手机阅读页的操作栏（点书页中间弹出的那层）
  if (document.querySelector('[data-phone-chrome="open"]')) {
    window.dispatchEvent(new Event(PHONE_CHROME_CLOSE));
    return true;
  }
  // 1.6 手机：点批注弹出的单条卡片、Nova 墨点边注小窗
  if (useLayoutStore.getState().focusedAnnotation) {
    useLayoutStore.getState().closeFocusedAnnotation();
    return true;
  }
  if (document.querySelector("[data-ink-tip]")) {
    window.dispatchEvent(new Event(INK_TIP_CLOSE));
    return true;
  }
  const settings = useAppSettingsStore.getState();
  if (settings.isSettingsDialogOpen) {
    settings.toggleSettingsDialog();
    return true;
  }

  const layout = useLayoutStore.getState();
  // 2. 首页抽屉
  if (layout.isHomeDrawerOpen) {
    layout.setHomeDrawerOpen(false);
    return true;
  }
  // 3. 沉浸阅读
  const immersive = useImmersiveStore.getState();
  if (immersive.immersive) {
    immersive.exitImmersive();
    return true;
  }
  // 4. 手机上的笔记 / AI 面板
  if (!layout.isHomeActive && window.innerWidth <= PHONE_MAX_WIDTH) {
    if (layout.isChatVisible) {
      layout.toggleChatSidebar();
      return true;
    }
    if (layout.isNotepadVisible) {
      layout.toggleNotepadSidebar();
      return true;
    }
  }
  // 5. 在看书：回首页（书签页保留）
  if (!layout.isHomeActive) {
    layout.navigateToHome();
    return true;
  }
  // 6. 首页的其他页面（聊天、记忆…）：回图书馆
  const hash = window.location.hash;
  if (hash && hash !== "#/" && hash !== "#") {
    window.location.hash = "#/";
    return true;
  }
  return false;
}

declare global {
  interface Window {
    __deepreaderBack?: () => boolean;
  }
}

export function installAndroidBack() {
  window.__deepreaderBack = () => {
    try {
      return handleAndroidBack();
    } catch (error) {
      console.error("android back failed", error);
      return false;
    }
  };
}

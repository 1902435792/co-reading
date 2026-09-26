import { useSyncExternalStore } from "react";

/** full = 形象＋气泡，bubble = 只要气泡，off = 关闭。 */
export type NovaCompanionMode = "full" | "bubble" | "off";

const STORAGE_KEY = "deepreader:nova-companion-mode";
const CHANGE_EVENT = "deepreader:nova-companion-mode-change";

export function getNovaCompanionMode(): NovaCompanionMode {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === "bubble" || value === "off" ? value : "full";
  } catch {
    return "full";
  }
}

export function setNovaCompanionMode(mode: NovaCompanionMode) {
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // 存储不可用时仍然在本次会话内生效。
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useNovaCompanionMode(): NovaCompanionMode {
  return useSyncExternalStore(subscribe, getNovaCompanionMode, () => "full");
}

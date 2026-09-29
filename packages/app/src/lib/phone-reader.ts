import { PHONE_MAX_WIDTH } from "@/hooks/use-is-phone";
import { useAppSettingsStore } from "@/store/app-settings-store";
import type { ViewSettings } from "@/types/book";

/**
 * 手机阅读页（起点式）：平时只有书，点屏幕中间才弹出操作栏。
 * 这里放和安卓原生层通信的小工具、事件名、翻页效果。
 */

declare global {
  interface Window {
    /** MainActivity 注入的原生接口（只在安卓 App 里有） */
    DeepReaderNative?: {
      setReaderImmersive: (on: boolean) => void;
      setStatusBarVisible: (visible: boolean) => void;
    };
  }
}

/** 点了书页中间：切换操作栏（detail.bookId） */
export const PHONE_CHROME_TOGGLE = "deepreader-toggle-reader-chrome";
/** 返回键等：收起操作栏 */
export const PHONE_CHROME_CLOSE = "deepreader-close-reader-chrome";

export type PageTurnEffect = "slide" | "fade" | "none" | "scroll";

export const PAGE_TURN_OPTIONS: { id: PageTurnEffect; label: string; hint: string }[] = [
  { id: "slide", label: "平移", hint: "左右滑动，页面跟着手指走" },
  { id: "fade", label: "淡入", hint: "轻轻一闪换页，不晃眼" },
  { id: "none", label: "无动画", hint: "直接换页，最省电" },
  { id: "scroll", label: "上下滚动", hint: "像网页一样一直往下看" },
];

export const isPhoneWidth = () => typeof window !== "undefined" && window.innerWidth <= PHONE_MAX_WIDTH;

/** 看书时藏起手机状态栏（首页恢复）。电脑 / 平板上什么也不做。 */
export function setNativeReaderImmersive(on: boolean) {
  try {
    window.DeepReaderNative?.setReaderImmersive(on);
  } catch {
    /* 不是安卓 App */
  }
}

/** 操作栏弹出时临时显示状态栏（看时间、电量），收起时再藏。 */
export function setNativeStatusBarVisible(visible: boolean) {
  try {
    window.DeepReaderNative?.setStatusBarVisible(visible);
  } catch {
    /* 不是安卓 App */
  }
}

/** 淡入翻页：翻页的同时让书页从半透明淡回来。 */
export function playFadeTurn(bookId: string) {
  const el = document.getElementById(`foliate-view-${bookId}`) ?? document.querySelector(`#gridcell-${bookId} foliate-view`);
  (el as HTMLElement | null)?.animate?.([{ opacity: 0.15 }, { opacity: 1 }], { duration: 260, easing: "ease-out" });
}

const PAGE_TURN_KEY = "deepreader:phonePageTurn";

/** 手机上记住的翻页方式（单独存一份在本机，同步读取，不怕启动时设置还没读完） */
export function getPhonePageTurn(): PageTurnEffect {
  const v = typeof localStorage !== "undefined" ? localStorage.getItem(PAGE_TURN_KEY) : null;
  return v === "slide" || v === "fade" || v === "none" || v === "scroll" ? v : "slide";
}

const effectMatches = (g: ViewSettings, effect: PageTurnEffect) =>
  effect === "scroll"
    ? g.scrolled
    : !g.scrolled && g.pageTurnEffect === effect && g.animated === (effect === "slide");

/** 改翻页方式：只改设置，阅读器那边会自动切换分页 / 滚动和动画 */
export function applyPageTurnEffect(effect: PageTurnEffect) {
  try {
    localStorage.setItem(PAGE_TURN_KEY, effect);
  } catch {
    /* ignore */
  }
  const { settings, setSettings } = useAppSettingsStore.getState();
  const g = settings.globalViewSettings;
  if (effectMatches(g, effect)) return;
  const next: ViewSettings =
    effect === "scroll"
      ? { ...g, scrolled: true, pageTurnEffect: g.pageTurnEffect ?? "slide" }
      : { ...g, scrolled: false, pageTurnEffect: effect, animated: effect === "slide" };
  setSettings({ ...settings, globalViewSettings: next });
}

/** 手机：让设置和本机记住的翻页方式一致（启动读完设置后、每本书打开后各调一次） */
export function ensurePhonePageTurn() {
  if (!isPhoneWidth()) return;
  applyPageTurnEffect(getPhonePageTurn());
}

/** 设置面板里点了「滚动 / 分页」：手机上顺便记住 */
export function rememberPhoneScrolled(scrolled: boolean) {
  if (!isPhoneWidth()) return;
  const cur = getPhonePageTurn();
  const g = useAppSettingsStore.getState().settings.globalViewSettings;
  const effect: PageTurnEffect = scrolled ? "scroll" : cur === "scroll" ? (g.pageTurnEffect ?? "slide") : cur;
  try {
    localStorage.setItem(PAGE_TURN_KEY, effect);
  } catch {
    /* ignore */
  }
}

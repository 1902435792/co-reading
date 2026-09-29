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
      setCurlEnabled?: (on: boolean) => void;
      setHomeStatusBarHidden?: (hidden: boolean) => void;
      setEdgeColor?: (r: number, g: number, b: number) => void;
      curlTurn?: (side: string) => void;
      curlTurned?: (turned: boolean, before: string, after: string) => void;
    };
    /** 仿真翻页：原生层截好图后调这个让书真的翻过去（silent=true 时不回调） */
    __deepreaderCurlTurn?: (side: "left" | "right", silent?: boolean) => void;
  }
}

/** 点了书页中间：切换操作栏（detail.bookId） */
export const PHONE_CHROME_TOGGLE = "deepreader-toggle-reader-chrome";
/** 返回键等：收起操作栏 */
export const PHONE_CHROME_CLOSE = "deepreader-close-reader-chrome";
/** 返回键等：收起 Nova 墨点边注小窗 */
export const INK_TIP_CLOSE = "deepreader-close-ink-tip";

export type PageTurnEffect = "curl" | "slide" | "fade" | "none" | "scroll";

export const PAGE_TURN_OPTIONS: { id: PageTurnEffect; label: string; hint: string }[] = [
  { id: "curl", label: "仿真", hint: "像纸书一样从角上卷过去，可以拖着翻" },
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
  return v === "curl" || v === "slide" || v === "fade" || v === "none" || v === "scroll" ? v : "slide";
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

/** 仿真翻页需要安卓原生层；网页 / 电脑上没有这个效果 */
export const curlSupported = () => typeof window !== "undefined" && typeof window.DeepReaderNative?.curlTurn === "function";

export function setNativeCurlEnabled(on: boolean) {
  try {
    window.DeepReaderNative?.setCurlEnabled?.(on);
  } catch {
    /* 不是安卓 App */
  }
}

/** 点左右翻页（仿真）：交给原生层截图、卷页，它再回调 __deepreaderCurlTurn 让书翻过去 */
export function nativeCurlTurn(side: "left" | "right"): boolean {
  try {
    if (!curlSupported()) return false;
    window.DeepReaderNative!.curlTurn!(side);
    return true;
  } catch {
    return false;
  }
}

type CurlView = HTMLElement & {
  goLeft: () => unknown;
  goRight: () => unknown;
  renderer: { start: number; getContents?: () => { index?: number }[] };
};

export function installCurlBridge() {
  if (window.__deepreaderCurlTurn) return;
  window.__deepreaderCurlTurn = (side, silent) => {
    const done = (turned: boolean, before = "", after = "") => {
      if (!silent) window.DeepReaderNative?.curlTurned?.(turned, before, after);
    };
    const view = Array.from(document.querySelectorAll<CurlView>("foliate-view")).find((el) =>
      el.checkVisibility?.({ visibilityProperty: true }),
    );
    if (!view?.renderer) return done(false);
    const where = () => `${view.renderer.getContents?.()?.[0]?.index ?? ""}:${Math.round(view.renderer.start)}`;
    const before = where();
    Promise.resolve()
      .then(() => (side === "left" ? view.goLeft() : view.goRight()))
      .catch(() => undefined)
      .then(() => {
        // 等两帧，让新页真的画出来再告诉原生层
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const after = where();
            done(after !== before, before, after);
          }),
        );
      });
  };
}

/** 手机首页也不显示系统状态栏 */
export function setNativeHomeStatusBarHidden(hidden: boolean) {
  try {
    window.DeepReaderNative?.setHomeStatusBarHidden?.(hidden);
  } catch {
    /* 不是安卓 App */
  }
}

/** 取屏幕某一点实际显示的底色（往上找第一个不透明的背景） */
function colorAt(x: number, y: number): [number, number, number] | null {
  let el = document.elementFromPoint(x, y) as HTMLElement | null;
  while (el) {
    const m = getComputedStyle(el).backgroundColor.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/);
    if (m && (m[4] === undefined || Number(m[4]) > 0.5)) return [Number(m[1]), Number(m[2]), Number(m[3])];
    el = el.parentElement;
  }
  return null;
}

/** 让摄像头 / 手势条那条留白跟界面同色：首页取顶部颜色，看书时取底部颜色 */
export function syncNativeEdgeColor(onHome: boolean) {
  try {
    if (!window.DeepReaderNative?.setEdgeColor) return;
    const c = colorAt(window.innerWidth / 2, onHome ? 2 : window.innerHeight - 2);
    if (c) window.DeepReaderNative.setEdgeColor(Math.round(c[0]), Math.round(c[1]), Math.round(c[2]));
  } catch {
    /* 不是安卓 App */
  }
}

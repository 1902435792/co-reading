import { useAppSettingsStore } from "@/store/app-settings-store";
import type { ViewSettings } from "@/types/book";
import type { FoliateView } from "@/types/view";
import { PHONE_CHROME_TOGGLE, curlUsableNow, isPhoneWidth, nativeCurlTurn } from "@/lib/phone-reader";
import { eventDispatcher } from "@/utils/event";
import { useReaderStoreApi } from "../components/reader-provider";

export type ScrollSource = "touch" | "mouse";

export const viewPagination = (
  view: FoliateView | null,
  viewSettings: ViewSettings | null | undefined,
  side: "left" | "right",
) => {
  if (!view || !viewSettings) return;
  const renderer = view.renderer;
  if (renderer.scrolled) {
    if (view.book.dir === "rtl") {
      side = side === "left" ? "right" : "left";
    }
    const { size } = renderer;
    const showHeader = viewSettings.showHeader && viewSettings.showBarsOnScroll;
    const showFooter = viewSettings.showFooter && viewSettings.showBarsOnScroll;
    const scrollingOverlap = viewSettings.scrollingOverlap;
    const distance = size - scrollingOverlap - (showHeader ? 44 : 0) - (showFooter ? 44 : 0);
    return side === "left" ? view.prev(distance) : view.next(distance);
  }
  return side === "left" ? view.goLeft() : view.goRight();
};

/**
 * 翻一页（手机 / 平板 / 电脑通用）：分页模式下按「翻页方式」加效果——
 * 仿真交给安卓原生层卷页；淡入在网页里做；平移由阅读器自己的动画完成。
 * 点屏幕两侧、键盘、底栏箭头、滚轮、音量键都走这里。
 */
export const turnPage = (
  view: FoliateView | null,
  viewSettings: ViewSettings | null | undefined,
  side: "left" | "right",
) => {
  if (!view || !viewSettings) return;
  if (!viewSettings.scrolled && !view.renderer.scrolled) {
    if (viewSettings.pageTurnEffect === "curl" && curlUsableNow() && nativeCurlTurn(side)) return;
    if (viewSettings.pageTurnEffect === "fade") {
      (view as unknown as HTMLElement).animate?.([{ opacity: 0.15 }, { opacity: 1 }], {
        duration: 260,
        easing: "ease-out",
      });
    }
  }
  return viewPagination(view, viewSettings, side);
};

/**
 * 滚轮 / 触控板：一次手势只翻一页。触控板轻轻一划会连发几十个滚轮事件（还带惯性），
 * 以前每个事件翻一页，一划就飞过好几页。现在翻完一页后，等滚轮停下 200ms 才接受下一次。
 */
const wheelGate = { locked: false, since: 0, timer: 0 as ReturnType<typeof setTimeout> | 0 };
const WHEEL_QUIET_MS = 200;
const WHEEL_MAX_LOCK_MS = 1000;
export function takeWheelTurn(deltaY: number): boolean {
  if (Math.abs(deltaY) < 2) return false;
  const now = Date.now();
  if (wheelGate.timer) clearTimeout(wheelGate.timer);
  wheelGate.timer = setTimeout(() => {
    wheelGate.locked = false;
    wheelGate.timer = 0;
  }, WHEEL_QUIET_MS);
  if (wheelGate.locked && now - wheelGate.since < WHEEL_MAX_LOCK_MS) return false;
  wheelGate.locked = true;
  wheelGate.since = now;
  return true;
}

export const usePagination = (bookId: string, containerRef: React.RefObject<HTMLDivElement>) => {
  const { settings } = useAppSettingsStore();
  const store = useReaderStoreApi();
  const globalViewSettings = settings.globalViewSettings!;

  const view = store.getState().view;

  const handlePageFlip = async (msg: MessageEvent | CustomEvent | React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    // 每次都取最新的 view：钩子第一次渲染时书还没打开，那时拿到的是 null
    const view = store.getState().view;
    const globalViewSettings = useAppSettingsStore.getState().settings.globalViewSettings!;
    if (msg instanceof MessageEvent) {
      if (msg.data && msg.data.bookId === bookId) {
        if (msg.data.type === "iframe-single-click") {
          const viewElement = containerRef.current;
          if (viewElement) {
            const { screenX } = msg.data;
            const viewRect = viewElement.getBoundingClientRect();
            const windowStartX = window.screenX;
            const viewStartX = windowStartX + viewRect.left;
            const viewCenterX = viewStartX + viewRect.width / 2;
            const consumed = eventDispatcher.dispatchSync("iframe-single-click");
            if (!consumed && isPhoneWidth()) {
              // 手机（起点式）：中间 1/3 呼出操作栏；分页时左 1/3 上一页、右 1/3 下一页；滚动模式点哪都呼出操作栏
              const rel = viewRect.width > 0 ? (screenX - viewStartX) / viewRect.width : 0.5;
              if (globalViewSettings.scrolled || (rel >= 1 / 3 && rel <= 2 / 3)) {
                window.dispatchEvent(new CustomEvent(PHONE_CHROME_TOGGLE, { detail: { bookId } }));
              } else {
                let side: "left" | "right" = rel < 1 / 3 ? "left" : "right";
                if (globalViewSettings.swapClickArea) side = side === "left" ? "right" : "left";
                turnPage(view, globalViewSettings, side);
              }
            } else if (!consumed && !globalViewSettings.scrolled) {
              // 平板 / 电脑分页模式：点左边约 3 成上一页、右边约 3 成下一页，中间不动（方便选字、点批注）
              const rel = viewRect.width > 0 ? (screenX - viewStartX) / viewRect.width : 0.5;
              if (rel < 0.3 || rel > 0.7) {
                let side: "left" | "right" = rel < 0.3 ? "left" : "right";
                if (globalViewSettings.swapClickArea) side = side === "left" ? "right" : "left";
                turnPage(view, globalViewSettings, side);
              }
            } else if (!consumed) {
              const centerStartX = viewStartX + viewRect.width * 0.375;
              const centerEndX = viewStartX + viewRect.width * 0.625;
              if (globalViewSettings.disableClick! || (screenX >= centerStartX && screenX <= centerEndX)) {
                // Center area - no action needed
              } else {
                if (!globalViewSettings.disableClick! && screenX >= viewCenterX) {
                  if (globalViewSettings.swapClickArea) {
                    viewPagination(view, globalViewSettings, "left");
                  } else {
                    viewPagination(view, globalViewSettings, "right");
                  }
                } else if (!globalViewSettings.disableClick! && screenX < viewCenterX) {
                  if (globalViewSettings.swapClickArea) {
                    viewPagination(view, globalViewSettings, "right");
                  } else {
                    viewPagination(view, globalViewSettings, "left");
                  }
                }
              }
            }
          }
        } else if (msg.data.type === "iframe-wheel" && !globalViewSettings.scrolled) {
          // The wheel event is handled by the iframe itself in scrolled mode.
          const { deltaY } = msg.data;
          if (takeWheelTurn(deltaY)) turnPage(view, globalViewSettings, deltaY > 0 ? "right" : "left");
        } else if (msg.data.type === "iframe-mouseup") {
          if (msg.data.button === 3) {
            view?.history.back();
          } else if (msg.data.button === 4) {
            view?.history.forward();
          }
        }
      }
    } else if (msg instanceof CustomEvent) {
      const { keyName } = msg.detail;
      if (globalViewSettings?.volumeKeysToFlip) {
        if (keyName === "VolumeUp") {
          turnPage(view, globalViewSettings, "left");
        } else if (keyName === "VolumeDown") {
          turnPage(view, globalViewSettings, "right");
        }
      }
    } else {
      if (msg.type === "click") {
        const { clientX } = msg;
        const width = window.innerWidth;
        const leftThreshold = width * 0.5;
        const rightThreshold = width * 0.5;
        if (clientX < leftThreshold) {
          viewPagination(view, globalViewSettings, "left");
        } else if (clientX > rightThreshold) {
          viewPagination(view, globalViewSettings, "right");
        }
      }
    }
  };

  const handleContinuousScroll = (mode: ScrollSource, scrollDelta: number, threshold: number) => {
    const renderer = view?.renderer;
    if (renderer && globalViewSettings.scrolled && globalViewSettings.continuousScroll) {
      const doScroll = () => {
        // may have overscroll where the start is greater than 0
        if (renderer.start <= scrollDelta && scrollDelta > threshold) {
          setTimeout(() => {
            view?.prev(renderer.start + 1);
          }, 100);
          // sometimes viewSize has subpixel value that the end never reaches
        } else if (Math.ceil(renderer.end) - scrollDelta >= renderer.viewSize && scrollDelta < -threshold) {
          setTimeout(() => {
            view?.next(renderer.viewSize - Math.floor(renderer.end) + 1);
          }, 100);
        }
      };
      if (mode === "mouse") {
        // we can always get mouse wheel events
        doScroll();
      } else if (mode === "touch") {
        // when the document height is less than the viewport height, we can't get the relocate event
        if (renderer.size >= renderer.viewSize) {
          doScroll();
        } else {
          // scroll after the relocate event
          renderer.addEventListener("relocate", () => doScroll(), { once: true });
        }
      }
    }
  };

  return {
    handlePageFlip,
    handleContinuousScroll,
  };
};

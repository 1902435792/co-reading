import { useUICSS } from "@/hooks/use-ui-css";
import { ensurePhonePageTurn } from "@/lib/phone-reader";
import type { BookDoc } from "@/lib/document";
import { useAppSettingsStore } from "@/store/app-settings-store";
import { useThemeStore } from "@/store/theme-store";
import type { BookConfig } from "@/types/book";
import type { ViewSettings } from "@/types/book";
import type { Insets } from "@/types/misc";
import type { FoliateView } from "@/types/view";
import { applyFixedlayoutStyles, getStyles } from "@/utils/style";
import { useEffect, useRef, useState } from "react";
import { useReaderStoreApi } from "../../components/reader-provider";
import { useMouseEvent } from "../use-iframe-events";
import { usePagination } from "../use-pagination";
import { useProgressAutoSave } from "../use-progress-auto-save";
import { FoliateViewerManager, type ProgressData } from "./foliate-viewer-manager";

export const useFoliateViewer = (bookId: string, bookDoc: BookDoc, config: BookConfig, insets: Insets) => {
  const store = useReaderStoreApi();
  const { themeCode, isDarkMode } = useThemeStore();
  const { settings, setSettings } = useAppSettingsStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const managerRef = useRef<FoliateViewerManager | null>(null);
  const viewRef = useRef<FoliateView | null>(null);
  const isInitialized = useRef(false);
  const [, forceUpdate] = useState({});

  useUICSS(bookId);
  useProgressAutoSave(bookId);

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    if (isInitialized.current || !containerRef.current) {
      console.log(
        "[useFoliateViewer] Skipping init - isInitialized:",
        isInitialized.current,
        "containerRef:",
        !!containerRef.current,
      );
      return;
    }

    console.log("[useFoliateViewer] Starting initialization");
    isInitialized.current = true;

    const manager = new FoliateViewerManager({
      bookId,
      bookDoc,
      config,
      insets,
      container: containerRef.current,
      globalViewSettings: settings.globalViewSettings,
      onViewCreated: (view) => {
        store.getState().setView(view);
        viewRef.current = view;
      },
    });

    manager.setProgressCallback((progress: ProgressData) => {
      store.getState().setProgress(progress);
      store.getState().setLocation(progress.location);
    });

    manager.setViewSettingsCallback((updatedSettings: ViewSettings) => {
      // 只写回从书里识别出的排版方向；其余用最新设置，免得把打开书期间刚改的设置（如手机翻页方式）盖回旧值
      const latest = useAppSettingsStore.getState().settings;
      setSettings({
        ...latest,
        globalViewSettings: {
          ...latest.globalViewSettings,
          vertical: updatedSettings.vertical,
          rtl: updatedSettings.rtl,
        },
      });
    });

    managerRef.current = manager;

    manager
      .initialize()
      .then(() => {
        // 书打开的过程中设置可能刚从存储里读完（App 启动时会在后台恢复上次的书）：
        // 按最新设置校正一次分页 / 滚动和翻页动画，免得停在默认的滚动模式
        ensurePhonePageTurn();
        const latest = useAppSettingsStore.getState().settings.globalViewSettings;
        const renderer = manager.getView()?.renderer;
        if (renderer) {
          manager.updateViewSettings({ scrolled: latest.scrolled, animated: latest.animated });
          const isScrolled = Boolean(renderer.scrolled);
          if (isScrolled !== latest.scrolled) {
            renderer.setAttribute("flow", latest.scrolled ? "scrolled" : "paginated");
          }
          if (latest.animated) renderer.setAttribute("animated", "");
          else renderer.removeAttribute("animated");
        }
        forceUpdate({});
      })
      .catch((error) => {
        console.error("Failed to initialize foliate viewer:", error);
      });

    return () => {
      if (managerRef.current) {
        managerRef.current.destroy();
        managerRef.current = null;
      }
      viewRef.current = null;
      isInitialized.current = false;
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    const view = managerRef.current?.getView();
    if (view?.renderer && isInitialized.current) {
      const styles = getStyles(settings.globalViewSettings, themeCode);
      view.renderer.setStyles?.(styles);

      if (bookDoc.rendition?.layout === "pre-paginated") {
        const docs = view.renderer.getContents();
        docs.forEach(({ doc }) => applyFixedlayoutStyles(doc, settings.globalViewSettings, themeCode));
      }
    }
  }, [themeCode, isDarkMode, settings.globalViewSettings, bookDoc.rendition?.layout]);

  // 页宽 / 页边距：同步给版面管理器并重排一次
  const readingWidth = settings.globalViewSettings.readingWidth ?? 0;
  const gapPercent = settings.globalViewSettings.gapPercent;
  const prevLayoutRef = useRef<string | null>(null);
  useEffect(() => {
    const manager = managerRef.current;
    if (!manager || !isInitialized.current) return;
    const key = `${readingWidth}:${gapPercent}`;
    if (prevLayoutRef.current === null) {
      prevLayoutRef.current = key;
      manager.updateViewSettings({ readingWidth, gapPercent });
      return;
    }
    if (prevLayoutRef.current === key) return;
    prevLayoutRef.current = key;
    manager.updateViewSettings({ readingWidth, gapPercent });
    manager.relayout();
  }, [readingWidth, gapPercent]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional fine-grained deps
  const scrolled = settings.globalViewSettings.scrolled;
  const prevScrolledRef = useRef<boolean | undefined>(undefined);
  useEffect(() => {
    const view = managerRef.current?.getView();
    if (!view?.renderer || !isInitialized.current) return;

    // setAttribute("flow", ...) 会让 foliate 重新渲染，丢失当前位置，
    // 所以只在 scrolled 状态真正切换时才调用，字体/边距等其他变化不触发。
    const flowChanged =
      (prevScrolledRef.current !== undefined && prevScrolledRef.current !== scrolled) ||
      Boolean(view.renderer.scrolled) !== scrolled;
    // 同步给版面管理器，免得之后转屏 / 改尺寸时又按旧的模式重排
    managerRef.current?.updateViewSettings({ scrolled });
    if (flowChanged) {
      view.renderer.setAttribute("flow", scrolled ? "scrolled" : "paginated");
    }
    prevScrolledRef.current = scrolled;
  }, [insets.top, insets.right, insets.bottom, insets.left, scrolled]);

  // 翻页动画（手机「翻页方式」里的平移 / 淡入 / 无动画）
  const animated = settings.globalViewSettings.animated;
  useEffect(() => {
    const manager = managerRef.current;
    const view = manager?.getView();
    if (!view?.renderer || !isInitialized.current) return;
    manager!.updateViewSettings({ animated });
    if (animated) view.renderer.setAttribute("animated", "");
    else view.renderer.removeAttribute("animated");
  }, [animated]);

  const { handlePageFlip, handleContinuousScroll } = usePagination(
    bookId,
    containerRef as React.RefObject<HTMLDivElement>,
  );

  const mouseHandlers = useMouseEvent(bookId, handlePageFlip, handleContinuousScroll);

  const refresh = async () => {
    if (managerRef.current) {
      await managerRef.current.refresh();
    }
  };

  return {
    containerRef,
    mouseHandlers,
    refresh,
    getView: () => managerRef.current?.getView() || null,
  } as const;
};

export default useFoliateViewer;

import { useReadingSession } from "@/hooks/use-reading-session";
import { NovaCompanion } from "@/components/nova/nova-companion";
import { useIsPhone } from "@/hooks/use-is-phone";
import { useSafeAreaInsets } from "@/hooks/use-safe-areaInsets";
import { useAppSettingsStore } from "@/store/app-settings-store";
import { useLayoutStore } from "@/store/layout-store";
import { useLibraryStore } from "@/store/library-store";
import { getInsetEdges } from "@/utils/grid";
import { getViewInsets } from "@/utils/insets";
import { useImmersiveStore } from "@/store/immersive-store";
import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import useBookShortcuts from "../hooks/use-book-shortcuts";
import { useCoReading } from "../hooks/use-co-reading";
import { useCoReadingNavigation } from "../hooks/use-co-reading-navigation";
import { useCoReadingRange } from "../hooks/use-co-reading-range";
import { useFoliateViewer } from "../hooks/use-foliate-viewer";
import { useReadingSummary } from "../hooks/use-reading-summary";
import Annotator from "./annotator";
import FooterBar from "./footer-bar";
import HeaderBar from "./header-bar";
import { PhoneBottomInfo, PhoneReaderOverlay, PhoneTopInfo } from "./phone-reader-chrome";
import { useReaderStore, useReaderStoreApi } from "./reader-provider";

const ReaderViewerContent: React.FC = () => {
  const bookId = useReaderStore((state) => state.bookId)!;
  const bookData = useReaderStore((state) => state.bookData);
  const config = useReaderStore((state) => state.config);
  const { settings } = useAppSettingsStore();

  const screenInsets = useSafeAreaInsets();
  const aspectRatio = window.innerWidth / window.innerHeight;
  const globalViewSettings = settings.globalViewSettings;

  const contentInsets = useMemo(() => {
    if (!screenInsets || !globalViewSettings) {
      return { top: 0, right: 0, bottom: 0, left: 0 };
    }

    const { top, right, bottom, left } = getInsetEdges(0, 1, aspectRatio);
    const gridInsets = {
      top: top ? screenInsets.top : 0,
      right: right ? screenInsets.right : 0,
      bottom: bottom ? screenInsets.bottom : 0,
      left: left ? screenInsets.left : 0,
    };

    const viewInsets = getViewInsets(globalViewSettings);

    return {
      top: gridInsets.top + viewInsets.top,
      right: gridInsets.right + viewInsets.right,
      bottom: gridInsets.bottom + viewInsets.bottom,
      left: gridInsets.left + viewInsets.left,
    };
  }, [screenInsets, globalViewSettings, aspectRatio]);

  if (!bookData?.bookDoc || !config || !contentInsets) {
    return null;
  }

  const foliateViewer = useFoliateViewer(bookId, bookData.bookDoc, config, contentInsets);

  return (
    <div ref={foliateViewer.containerRef} className="flex-1" data-book-id={bookId} {...foliateViewer.mouseHandlers} />
  );
};

export default function ReaderViewer() {
  const store = useReaderStoreApi();
  useBookShortcuts();

  const bookId = useReaderStore((state) => state.bookId)!;
  const bookData = useReaderStore((state) => state.bookData);
  const config = useReaderStore((state) => state.config);
  const isLoading = useReaderStore((state) => state.isLoading);
  const error = useReaderStore((state) => state.error);

  const { settings } = useAppSettingsStore();
  const { booksWithStatus } = useLibraryStore();

  // 判断当前 tab 是否可见（不在首页 && 当前激活的 tab）
  const { activeTabId, isHomeActive } = useLayoutStore();
  const tabId = `reader-${bookId}`;
  const isTabVisible = !isHomeActive && activeTabId === tabId;
  useCoReading(bookId, isTabVisible);
  useCoReadingRange(bookId);
  useCoReadingNavigation(bookId);
  useReadingSummary(bookId);

  const isPhone = useIsPhone();
  const immersive = useImmersiveStore((state) => state.immersive);
  const exitImmersive = useImmersiveStore((state) => state.exitImmersive);
  // 沉浸阅读的提示只在「刚进入」时弹一次；切换标签页回来不再重复。
  const immersiveAnnouncedRef = useRef(false);
  useEffect(() => {
    if (!immersive) {
      immersiveAnnouncedRef.current = false;
      return;
    }
    if (!isTabVisible || immersiveAnnouncedRef.current) return;
    immersiveAnnouncedRef.current = true;
    toast("沉浸阅读", { description: "按 Esc 或 Z 退出，也可以右键 Nova", duration: 3_000 });
  }, [immersive, isTabVisible]);
  // 沉浸阅读：Esc 退出（正文 iframe 里的按键通过 postMessage 转发过来）。
  // 如果这次 Esc 已经被对话框、菜单、搜索框等处理掉了，就不再顺带退出沉浸模式。
  useEffect(() => {
    if (!immersive || !isTabVisible) return;
    const escapeHandledElsewhere = () =>
      Boolean(document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [data-radix-popper-content-wrapper]'));
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest?.("input, textarea, [contenteditable='true']")) return;
      if (escapeHandledElsewhere()) return;
      exitImmersive();
    };
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== "iframe-keydown" || event.data.key !== "Escape") return;
      if (escapeHandledElsewhere()) return;
      exitImmersive();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("message", onMessage);
    };
  }, [immersive, isTabVisible, exitImmersive]);
  // 关掉阅读页时恢复侧栏。
  useEffect(() => () => useImmersiveStore.getState().exitImmersive(), []);

  const { sessionStats, isInitialized: isSessionInitialized } = useReadingSession(bookId, {
    saveInterval: 5 * 1000,
    isVisible: isTabVisible,
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    const currentBookData = store.getState().bookData;
    if (!currentBookData) {
      store.getState().initBook();
    }
  }, [store, booksWithStatus, settings.globalViewSettings]);

  useEffect(() => {
    store.getState().setSessionStats(sessionStats);
    store.getState().setSessionInitialized(isSessionInitialized);
  }, [store, sessionStats, isSessionInitialized]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-neutral-500">loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-red-500">{error}</div>
      </div>
    );
  }

  if (!bookData || !config) {
    return null;
  }

  return (
    <div id={`gridcell-${bookId}`} className="relative flex h-full w-full flex-col rounded-md bg-background">
      {isPhone ? <PhoneTopInfo /> : !immersive && <HeaderBar />}
      <ReaderViewerContent />
      {isPhone ? <PhoneBottomInfo /> : !immersive && <FooterBar />}
      <Annotator />
      <NovaCompanion bookId={bookId} isTabVisible={isTabVisible} />
      {isPhone && <PhoneReaderOverlay bookId={bookId} isTabVisible={isTabVisible} />}
    </div>
  );
}

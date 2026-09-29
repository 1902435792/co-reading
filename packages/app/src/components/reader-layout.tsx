import { sidebarBounds } from "@/lib/sidebar-width";
import HomeLayout from "@/components/home-layout";
import { NotepadContainer } from "@/components/notepad";
import NotificationDropdown from "@/components/notification-dropdown";
import SettingsDialog from "@/components/settings/settings-dialog";
import SideChat from "@/components/side-chat";
import WindowControls from "@/components/window-controls";
import { PhoneSheet } from "@/components/phone-sheet";
import { FocusedThreadSheet } from "@/components/notepad/focused-thread-sheet";
import {
  ensurePhonePageTurn,
  curlSupported,
  installCurlBridge,
  setNativeCurlEnabled,
  setNativeHomeStatusBarHidden,
  setNativeReaderImmersive,
  syncNativeEdgeColor,
} from "@/lib/phone-reader";
import { useIsPhone } from "@/hooks/use-is-phone";
import { useFontEvents } from "@/hooks/use-font-events";
import ReaderViewer from "@/pages/reader";
import { ReaderProvider } from "@/pages/reader/components/reader-provider";
import { useAppSettingsStore } from "@/store/app-settings-store";
import { useLayoutStore } from "@/store/layout-store";
import { useThemeStore } from "@/store/theme-store";
import { getOSPlatform } from "@/utils/misc";
import { Tabs } from "app-tabs";
import { HomeIcon, Menu } from "lucide-react";
import { Resizable } from "re-resizable";
import { type ReactNode, useEffect, useRef, useState } from "react";

/**
 * 侧栏开合：宽度一步到位（阅读区只重排一次），内容用 transform/opacity 滑入淡出（走合成层，不卡）。
 * 关闭时先淡出再收起宽度；关闭后不卸载，保留状态。
 */
const SIDEBAR_FADE_MS = 180;
function SlidingSidebar({
  open,
  side,
  children,
  onSettled,
}: {
  open: boolean;
  side: "left" | "right";
  children: ReactNode;
  onSettled: () => void;
}) {
  const [mounted, setMounted] = useState(open);
  const [expanded, setExpanded] = useState(open);
  const [visible, setVisible] = useState(open);
  const firstRef = useRef(true);
  const settledRef = useRef(onSettled);
  settledRef.current = onSettled;
  useEffect(() => {
    if (firstRef.current) {
      firstRef.current = false;
      return;
    }
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (open) {
      setMounted(true);
      setExpanded(true);
      // 下一帧再显示，保证淡入过渡生效
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          setVisible(true);
          settledRef.current();
        });
      });
    } else {
      setVisible(false);
      timer = setTimeout(() => {
        setExpanded(false);
        requestAnimationFrame(() => settledRef.current());
      }, SIDEBAR_FADE_MS);
    }
    return () => {
      cancelAnimationFrame(frame);
      if (timer) clearTimeout(timer);
    };
  }, [open]);
  return (
    <div className={`h-full shrink-0 ${expanded ? "" : "hidden"}`} aria-hidden={!open}>
      <div
        className="sidebar-slide-inner h-full min-w-0"
        data-open={visible}
        data-side={side}
        inert={!open || undefined}
      >
        {mounted && children}
      </div>
    </div>
  );
}

export default function ReaderLayout() {
  useFontEvents();
  const {
    tabs,
    activeTabId,
    isHomeActive,

    removeTab,
    activateTab,
    navigateToHome,
    getReaderStore,
    isChatVisible,
    isNotepadVisible,
    toggleChatSidebar,
    toggleNotepadSidebar,
    setHomeDrawerOpen,
  } = useLayoutStore();
  const isPhone = useIsPhone();
  const { isDarkMode, swapSidebars } = useThemeStore();
  const { isSettingsDialogOpen, toggleSettingsDialog } = useAppSettingsStore();
  // 量出内容区宽度，给两个侧栏限宽：平板竖屏两栏都开时右边那栏不会被挤出屏幕。
  const mainRef = useRef<HTMLElement | null>(null);
  const [mainWidth, setMainWidth] = useState(0);
  useEffect(() => {
    const el = mainRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const width = Math.round(entries[0]?.contentRect.width ?? 0);
      setMainWidth((prev) => (prev === width ? prev : width));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const bounds = sidebarBounds(mainWidth, isNotepadVisible, isChatVisible);

  const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [showOverlay, setShowOverlay] = useState(false);

  const isWindows = getOSPlatform() === "windows";

  // 侧栏开合：宽度一步到位后只重排一次，不盖遮罩（避免白闪）
  const sidebarStateRef = useRef<string | null>(null);
  const settleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const settleSidebars = () => {
    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    setShowOverlay(false);
    const bookIds = tabs.map((tab) => tab.bookId).filter(Boolean);
    window.dispatchEvent(new CustomEvent("foliate-resize-update", { detail: { bookIds, source: "sidebar-toggle" } }));
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在侧栏开关变化时触发
  useEffect(() => {
    const key = `${isChatVisible}:${isNotepadVisible}`;
    if (sidebarStateRef.current === null) {
      sidebarStateRef.current = key;
      return;
    }
    if (sidebarStateRef.current === key) return;
    sidebarStateRef.current = key;
    // 兜底：万一 onSettled 没触发，也保证重排一次
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = setTimeout(settleSidebars, 400);
  }, [isChatVisible, isNotepadVisible]);

  // 手机：打开 / 切换到一本书时，两个侧栏先收起，让书占满屏幕（共读照常在后台跑）。
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在切书时触发
  useEffect(() => {
    if (!isPhone || !activeTabId) return;
    const state = useLayoutStore.getState();
    if (state.isChatVisible) state.toggleChatSidebar();
    if (state.isNotepadVisible) state.toggleNotepadSidebar();
  }, [isPhone, activeTabId]);

  // 手机第一次用：翻页方式默认「分页 + 平移」（像起点那样左右翻）。等设置从存储里读完再改，免得被覆盖。
  useEffect(() => {
    // 安卓平板也能用仿真翻页，所以卷页回调不分手机平板都装上（电脑上没有原生层，装了也不起作用）
    installCurlBridge();
  }, []);
  useEffect(() => {
    if (!isPhone) return;
    const run = () => ensurePhonePageTurn();
    if (useAppSettingsStore.persist.hasHydrated()) run();
    else return useAppSettingsStore.persist.onFinishHydration(run);
  }, [isPhone]);

  // 安卓平板：仿真翻页时让原生层接管左右拖动。侧栏、设置、弹出菜单开着时交还给网页，
  // 免得拖设置里的滑块、在侧栏里划动时把书页卷起来。（手机由 PhoneReaderChrome 管）
  const tabletCurlWanted = useAppSettingsStore(
    (s) =>
      !isPhone &&
      curlSupported() &&
      !s.isSettingsDialogOpen &&
      !s.settings.globalViewSettings?.scrolled &&
      s.settings.globalViewSettings?.pageTurnEffect === "curl",
  );
  const [overlayOpen, setOverlayOpen] = useState(false);
  useEffect(() => {
    if (!tabletCurlWanted) return;
    const check = () =>
      setOverlayOpen(
        Boolean(
          document.querySelector(
            '[data-radix-popper-content-wrapper], [role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
          ),
        ),
      );
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true });
    return () => observer.disconnect();
  }, [tabletCurlWanted]);
  const tabletCurlOn =
    tabletCurlWanted && !isHomeActive && Boolean(activeTabId) && !isNotepadVisible && !isChatVisible && !overlayOpen;
  useEffect(() => {
    if (isPhone) return;
    setNativeCurlEnabled(tabletCurlOn);
    // 原生层卷页时书页本身不跟着手指平移，不然截图会歪
    (window as unknown as { __deepreaderNativeSwipe?: boolean }).__deepreaderNativeSwipe = tabletCurlOn;
  }, [isPhone, tabletCurlOn]);

  // 手机看书时藏起系统状态栏，回书架再显示
  const readerOnPhone = isPhone && !isHomeActive && Boolean(activeTabId);
  useEffect(() => {
    setNativeReaderImmersive(readerOnPhone);
  }, [readerOnPhone]);
  // 首页也藏起系统状态栏（只给摄像头让位）
  useEffect(() => {
    setNativeHomeStatusBarHidden(isPhone);
  }, [isPhone]);
  // 顶部摄像头那条留白、底部手势条那条留白跟界面同色（换主题、回书架、进书时都重新取）
  const edgeThemeKey = useThemeStore((s) => s.themeColor);
  const edgeViewKey = useAppSettingsStore((s) => s.settings.globalViewSettings);
  useEffect(() => {
    if (!isPhone) return;
    const run = () => syncNativeEdgeColor(!readerOnPhone);
    const t1 = setTimeout(run, 120);
    const t2 = setTimeout(run, 700);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isPhone, readerOnPhone, isDarkMode, edgeThemeKey, edgeViewKey]);

  // 手机：两个面板同一时间只开一个，新打开的那个留下。
  const prevPanelsRef = useRef({ chat: isChatVisible, notepad: isNotepadVisible });
  useEffect(() => {
    const prev = prevPanelsRef.current;
    prevPanelsRef.current = { chat: isChatVisible, notepad: isNotepadVisible };
    if (!isPhone || !(isChatVisible && isNotepadVisible)) return;
    if (!prev.chat) toggleNotepadSidebar();
    else toggleChatSidebar();
  }, [isPhone, isChatVisible, isNotepadVisible, toggleChatSidebar, toggleNotepadSidebar]);

  useEffect(() => {
    const handleResize = () => {
      setShowOverlay(true);

      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }

      resizeTimeoutRef.current = setTimeout(() => {
        setShowOverlay(false);
      }, 200);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isCloseShortcut =
        (event.metaKey && event.key === "w" && event.code === "KeyW") ||
        (event.ctrlKey && event.key === "w" && event.code === "KeyW");

      if (isCloseShortcut) {
        event.preventDefault();
        if (activeTabId && activeTabId !== "home") {
          removeTab(activeTabId);
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeTabId, removeTab]);

  return (
    <div className="flex h-screen flex-col overflow-clip bg-muted">
      {/* 手机看书时藏起标签栏（起点式全屏阅读，点书页中间才出操作栏） */}
      <div
        className={`select-none border-neutral-200 dark:border-neutral-700 dark:bg-tab-background ${
          isPhone && !isHomeActive ? "hidden" : ""
        }`}
      >
        <Tabs
          tabs={tabs}
          onTabActive={activateTab}
          onTabClose={removeTab}
          onTabReorder={() => {}}
          draggable={true}
          darkMode={isDarkMode}
          className="h-7"
          enableDragRegion={true}
          marginLeft={isWindows || isPhone ? 0 : 60}
          pinnedLeft={
            <div className="mx-2 flex items-center gap-3">
              {isPhone && (
                <Menu
                  aria-label="菜单"
                  className="size-5 text-neutral-700 dark:text-neutral-400"
                  onClick={() => {
                    navigateToHome();
                    setHomeDrawerOpen(true);
                  }}
                />
              )}
              <HomeIcon
                onClick={navigateToHome}
                className="size-5 text-neutral-700 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
              />
            </div>
          }
          pinnedRight={
            <div className="flex items-center gap-1">
              <NotificationDropdown />
              <WindowControls />
            </div>
          }
        />
      </div>

      {/* overflow-clip：内容区不许被程序滚动。平板上侧栏若比容器高，聚焦/scrollIntoView 会把整块内容顶上去，盖住各栏顶部按钮。 */}
      <main ref={mainRef} className="relative min-h-0 flex-1 overflow-clip rounded-md">
        <div
          className="absolute inset-0"
          style={{
            visibility: isHomeActive ? "visible" : "hidden",
            zIndex: isHomeActive ? 1 : 0,
          }}
        >
          <HomeLayout />
        </div>

        {tabs.map((tab) => {
          const store = getReaderStore(tab.id);
          if (!store) return null;

          const notepadSidebar = (
            <SlidingSidebar open={isNotepadVisible} side={swapSidebars ? "right" : "left"} onSettled={settleSidebars}>
              <Resizable
                defaultSize={{
                  width: 300,
                  height: "100%",
                }}
                minWidth={bounds.notepad.min}
                maxWidth={bounds.notepad.max}
                enable={{
                  top: false,
                  right: !swapSidebars,
                  bottom: false,
                  left: swapSidebars,
                  topRight: false,
                  bottomRight: false,
                  bottomLeft: false,
                  topLeft: false,
                }}
                handleComponent={
                  swapSidebars
                    ? { left: <div className="custom-resize-handle" /> }
                    : { right: <div className="custom-resize-handle custom-resize-handle-left" /> }
                }
                className="h-full"
                onResize={() => {
                  if (!showOverlay) {
                    setShowOverlay(true);
                  }
                }}
                onResizeStop={() => {
                  setShowOverlay(false);
                  window.dispatchEvent(
                    new CustomEvent("foliate-resize-update", {
                      detail: { bookId: tab.bookId, bookIds: [tab.bookId], source: "resize-drag" },
                    }),
                  );
                }}
              >
                <div
                  className={
                    swapSidebars
                      ? "ml-1 h-full overflow-hidden rounded-lg border bg-background shadow-sm"
                      : "mr-1 h-full overflow-hidden rounded-lg border bg-background shadow-sm"
                  }
                >
                  <NotepadContainer bookId={tab.bookId} />
                </div>
              </Resizable>
            </SlidingSidebar>
          );

          const chatSidebar = (
            <SlidingSidebar open={isChatVisible} side={swapSidebars ? "left" : "right"} onSettled={settleSidebars}>
              <Resizable
                defaultSize={{
                  width: 370,
                  height: "100%",
                }}
                minWidth={bounds.chat.min}
                maxWidth={bounds.chat.max}
                enable={{
                  top: false,
                  right: swapSidebars,
                  bottom: false,
                  left: !swapSidebars,
                  topRight: false,
                  bottomRight: false,
                  bottomLeft: false,
                  topLeft: false,
                }}
                handleComponent={
                  swapSidebars
                    ? { right: <div className="custom-resize-handle custom-resize-handle-left" /> }
                    : { left: <div className="custom-resize-handle" /> }
                }
                className="h-full"
                onResize={() => {
                  if (!showOverlay) {
                    setShowOverlay(true);
                  }
                }}
                onResizeStop={() => {
                  setShowOverlay(false);
                  window.dispatchEvent(
                    new CustomEvent("foliate-resize-update", {
                      detail: { bookId: tab.bookId, bookIds: [tab.bookId], source: "resize-drag" },
                    }),
                  );
                }}
              >
                <div
                  className={
                    swapSidebars
                      ? "mr-1 h-full overflow-hidden rounded-lg border bg-background shadow-sm"
                      : "ml-1 h-full overflow-hidden rounded-lg border bg-background shadow-sm"
                  }
                >
                  <SideChat key={`chat-${tab.id}`} bookId={tab.bookId} />
                </div>
              </Resizable>
            </SlidingSidebar>
          );

          if (isPhone) {
            return (
              <ReaderProvider store={store} key={tab.id}>
                <div
                  className="absolute inset-0 overflow-clip bg-background"
                  style={{
                    visibility: tab.id === activeTabId ? "visible" : "hidden",
                    zIndex: tab.id === activeTabId ? 1 : 0,
                  }}
                >
                  {/* isolate：书里各层的 z-index 只在这一层里比，面板永远盖在书上面，点面板也不会翻页 */}
                  <div className="relative isolate h-full w-full">
                    <ReaderViewer />
                  </div>
                  <PhoneSheet open={isNotepadVisible} title="笔记 · 书评区" onClose={toggleNotepadSidebar}>
                    <NotepadContainer bookId={tab.bookId} />
                  </PhoneSheet>
                  <PhoneSheet open={isChatVisible} title="共读 AI" onClose={toggleChatSidebar}>
                    <SideChat key={`chat-${tab.id}`} bookId={tab.bookId} />
                  </PhoneSheet>
                  <FocusedThreadSheet bookId={tab.bookId} active={tab.id === activeTabId} />
                </div>
              </ReaderProvider>
            );
          }

          return (
            <ReaderProvider store={store} key={tab.id}>
              <div
                className="absolute inset-0 flex overflow-clip bg-background p-1"
                style={{
                  visibility: tab.id === activeTabId ? "visible" : "hidden",
                  zIndex: tab.id === activeTabId ? 1 : 0,
                }}
              >
                {swapSidebars ? chatSidebar : notepadSidebar}

                <div className="relative min-w-0 flex-1 rounded-md border shadow-around">
                  <ReaderViewer />

                  <div
                    aria-hidden
                    className={`pointer-events-none absolute inset-0 z-50 rounded-md bg-background/70 backdrop-blur-[2px] transition-opacity duration-200 dark:bg-neutral-900/50 ${
                      showOverlay ? "opacity-100" : "opacity-0"
                    }`}
                  />
                </div>

                {swapSidebars ? notepadSidebar : chatSidebar}
              </div>
            </ReaderProvider>
          );
        })}
      </main>

      <SettingsDialog open={isSettingsDialogOpen} onOpenChange={toggleSettingsDialog} />
    </div>
  );
}

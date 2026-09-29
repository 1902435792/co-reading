import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  PAGE_TURN_OPTIONS,
  PHONE_CHROME_CLOSE,
  PHONE_CHROME_TOGGLE,
  type PageTurnEffect,
  applyPageTurnEffect,
  curlSupported,
  setNativeCurlEnabled,
  setNativeStatusBarVisible,
} from "@/lib/phone-reader";
import { useAppSettingsStore } from "@/store/app-settings-store";
import { useLayoutStore } from "@/store/layout-store";
import { useThemeStore } from "@/store/theme-store";
import type { ViewSettings } from "@/types/book";
import { ArrowLeft, BookOpenText, ChevronLeft, ChevronRight, Moon, NotebookPen, Sparkles, Sun, TableOfContents } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { MdCheck } from "react-icons/md";
import { useReaderStore } from "./reader-provider";
import SearchDropdown from "./search-dropdown";
import SettingsDropdown from "./settings-dropdown";
import TOCView from "./toc-view";

/** 当前翻页方式（上下滚动优先） */
const currentEffect = (s: ViewSettings): PageTurnEffect =>
  s.scrolled ? "scroll" : (s.pageTurnEffect ?? (s.animated ? "slide" : "none"));

/** 书页上方一行小字：章节名（顶部留出摄像头 / 状态栏的位置） */
export function PhoneTopInfo() {
  const progress = useReaderStore((s) => s.progress);
  const title = useReaderStore((s) => s.bookData?.book?.title) || "";
  return (
    <div className="shrink-0 select-none px-5" style={{ paddingTop: "var(--dr-top-inset, 0px)" }}>
      <div className="flex h-6 items-end truncate pb-0.5 text-[11px] text-neutral-400 dark:text-neutral-500">
        {progress?.sectionLabel || title}
      </div>
    </div>
  );
}

/** 书页下方一行小字：进度 + 页码 */
export function PhoneBottomInfo() {
  const progress = useReaderStore((s) => s.progress);
  const pi = progress?.pageinfo;
  const valid = pi && pi.current >= 0 && pi.total > 0;
  const percent = valid ? `${(((pi.current + 1) / pi.total) * 100).toFixed(1)}%` : "";
  return (
    <div className="flex h-6 shrink-0 select-none items-start justify-between px-5 text-[11px] text-neutral-400 dark:text-neutral-500">
      <span>{percent}</span>
      <span>{valid ? `${pi.current + 1} / ${pi.total}` : ""}</span>
    </div>
  );
}

const BarButton = ({
  icon,
  label,
  onClick,
  active,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  active?: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex flex-1 flex-col items-center gap-1 py-1 text-[11px] outline-none active:opacity-60 ${
      active ? "text-primary" : "text-neutral-700 dark:text-neutral-300"
    }`}
  >
    {icon}
    <span>{label}</span>
  </button>
);

/**
 * 起点式操作层：平时完全隐藏；点书页中间弹出上下两条操作栏，再点一下书页（或按返回）收起。
 */
export function PhoneReaderOverlay({ bookId, isTabVisible }: { bookId: string; isTabVisible: boolean }) {
  const [open, setOpen] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const [turnOpen, setTurnOpen] = useState(false);
  const [dragValue, setDragValue] = useState<number | null>(null);

  const view = useReaderStore((s) => s.view);
  const progress = useReaderStore((s) => s.progress);
  const bookDoc = useReaderStore((s) => s.bookData?.bookDoc);
  const title = useReaderStore((s) => s.bookData?.book?.title) || "";
  const globalViewSettings = useAppSettingsStore((s) => s.settings.globalViewSettings);
  const { isDarkMode, setThemeMode } = useThemeStore();
  const { navigateToHome, toggleChatSidebar, toggleNotepadSidebar } = useLayoutStore();

  // 书页中间被点了 / 返回键
  useEffect(() => {
    const onToggle = (e: Event) => {
      if ((e as CustomEvent).detail?.bookId === bookId) setOpen((o) => !o);
    };
    const onClose = () => setOpen(false);
    window.addEventListener(PHONE_CHROME_TOGGLE, onToggle);
    window.addEventListener(PHONE_CHROME_CLOSE, onClose);
    return () => {
      window.removeEventListener(PHONE_CHROME_TOGGLE, onToggle);
      window.removeEventListener(PHONE_CHROME_CLOSE, onClose);
    };
  }, [bookId]);

  useEffect(() => {
    if (!isTabVisible) setOpen(false);
  }, [isTabVisible]);

  // 操作栏出来时临时显示状态栏（看时间电量），收起再藏
  useEffect(() => {
    if (isTabVisible) setNativeStatusBarVisible(open);
  }, [open, isTabVisible]);
  useEffect(() => () => setNativeStatusBarVisible(false), []);

  // 仿真翻页：只在看书、分页、菜单和面板都收着时让原生层接管左右拖动
  const { isChatVisible, isNotepadVisible } = useLayoutStore();
  const curlOn = isTabVisible && !open && !isChatVisible && !isNotepadVisible && currentEffect(globalViewSettings) === "curl";
  const curlMode = currentEffect(globalViewSettings) === "curl" && curlSupported();
  useEffect(() => {
    setNativeCurlEnabled(curlOn);
  }, [curlOn]);
  useEffect(() => {
    // 仿真模式下书页本身不跟手指挪（交给原生层卷页），否则截图会歪一点
    (window as unknown as { __deepreaderNativeSwipe?: boolean }).__deepreaderNativeSwipe = curlMode;
  }, [curlMode]);
  useEffect(() => () => setNativeCurlEnabled(false), []);

  const close = useCallback(() => {
    setOpen(false);
    setTocOpen(false);
    setTurnOpen(false);
  }, []);

  const pi = progress?.pageinfo;
  const total = pi && pi.total > 0 ? pi.total : 0;
  const current = pi && pi.current >= 0 ? pi.current : 0;
  const sliderValue = dragValue ?? current;
  const effect = currentEffect(globalViewSettings);

  const commitSlider = () => {
    if (dragValue !== null && total > 1) {
      view?.goToFraction(Math.min(0.9999, Math.max(0, dragValue / (total - 1))));
    }
    setDragValue(null);
  };

  const openPanel = (which: "chat" | "notes") => {
    close();
    const layout = useLayoutStore.getState();
    if (which === "chat" && !layout.isChatVisible) toggleChatSidebar();
    if (which === "notes" && !layout.isNotepadVisible) toggleNotepadSidebar();
  };

  return (
    <div
      className="pointer-events-none absolute inset-0 z-30"
      data-phone-chrome={open ? "open" : "closed"}
      aria-hidden={!open}
    >
      {/* 点书页空白处收起 */}
      {open && (
        <button
          type="button"
          aria-label="收起操作栏"
          className="pointer-events-auto absolute inset-0 cursor-default bg-transparent"
          onClick={close}
        />
      )}

      {/* 顶栏 */}
      <div
        className={`pointer-events-auto absolute inset-x-0 top-0 border-b bg-background shadow-sm transition-transform duration-200 ease-out ${
          open ? "translate-y-0" : "-translate-y-full"
        }`}
        style={{ paddingTop: "var(--dr-top-inset, 0px)" }}
        inert={!open || undefined}
      >
        <div className="flex h-12 items-center gap-1 px-1">
          <button
            type="button"
            aria-label="回书架"
            onClick={() => {
              close();
              navigateToHome();
            }}
            className="flex size-10 items-center justify-center rounded-full active:bg-muted"
          >
            <ArrowLeft className="size-5" />
          </button>
          <div className="min-w-0 flex-1 truncate font-medium text-sm">{title}</div>
          <div className="flex size-10 items-center justify-center">
            <SearchDropdown />
          </div>
          <button
            type="button"
            aria-label="笔记"
            onClick={() => openPanel("notes")}
            className="flex size-10 items-center justify-center rounded-full active:bg-muted"
          >
            <NotebookPen className="size-5" />
          </button>
          <button
            type="button"
            aria-label="共读 AI"
            onClick={() => openPanel("chat")}
            className="flex size-10 items-center justify-center rounded-full active:bg-muted"
          >
            <Sparkles className="size-5" />
          </button>
        </div>
      </div>

      {/* 底栏 */}
      <div
        className={`pointer-events-auto absolute inset-x-0 bottom-0 border-t bg-background pb-1 shadow-[0_-2px_8px_rgba(0,0,0,0.06)] transition-transform duration-200 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        inert={!open || undefined}
      >
        <div className="truncate px-4 pt-2 text-center text-[11px] text-neutral-500">
          {progress?.sectionLabel || ""}
          {total > 0 && ` · ${(((sliderValue + 1) / total) * 100).toFixed(1)}%`}
        </div>
        <div className="flex items-center gap-2 px-2 py-1">
          <button
            type="button"
            onClick={() => view?.renderer.prevSection?.()}
            className="flex shrink-0 items-center rounded-full px-2 py-2 text-[13px] active:bg-muted"
          >
            <ChevronLeft className="size-4" />
            上一章
          </button>
          <input
            type="range"
            aria-label="阅读进度"
            min={0}
            max={Math.max(0, total - 1)}
            step={1}
            value={sliderValue}
            disabled={total <= 1}
            onChange={(e) => setDragValue(Number(e.target.value))}
            onPointerUp={commitSlider}
            onTouchEnd={commitSlider}
            onKeyUp={commitSlider}
            className="h-6 min-w-0 flex-1 accent-primary"
          />
          <button
            type="button"
            onClick={() => view?.renderer.nextSection?.()}
            className="flex shrink-0 items-center rounded-full px-2 py-2 text-[13px] active:bg-muted"
          >
            下一章
            <ChevronRight className="size-4" />
          </button>
        </div>

        <div className="flex items-stretch px-1 pt-1">
          <DropdownMenu open={tocOpen} onOpenChange={setTocOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex flex-1 flex-col items-center gap-1 py-1 text-[11px] text-neutral-700 outline-none active:opacity-60 dark:text-neutral-300"
              >
                <TableOfContents size={20} />
                <span>目录</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="top"
              align="start"
              collisionPadding={8}
              className="max-h-[70vh] w-[calc(100vw-1rem)] overflow-y-auto p-0"
            >
              {bookDoc?.toc ? (
                <TOCView
                  toc={bookDoc.toc}
                  bookId={bookId}
                  autoExpand={true}
                  onItemSelect={close}
                  isVisible={tocOpen}
                />
              ) : (
                <div className="p-4 text-center text-muted-foreground">没有可用的目录</div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu open={turnOpen} onOpenChange={setTurnOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex flex-1 flex-col items-center gap-1 py-1 text-[11px] text-neutral-700 outline-none active:opacity-60 dark:text-neutral-300"
              >
                <BookOpenText size={20} />
                <span>翻页</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="center" collisionPadding={8} className="w-64 p-1">
              <div className="px-3 pt-2 pb-1 text-[11px] text-muted-foreground">
                分页时：点左边上一页，点右边下一页，也可以左右滑；点中间呼出菜单
              </div>
              {PAGE_TURN_OPTIONS.filter((opt) => opt.id !== "curl" || curlSupported()).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    applyPageTurnEffect(opt.id);
                    setTurnOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left active:bg-muted ${
                    effect === opt.id ? "bg-muted" : ""
                  }`}
                >
                  <span>
                    <span className="block text-sm">{opt.label}</span>
                    <span className="block text-[11px] text-muted-foreground">{opt.hint}</span>
                  </span>
                  {effect === opt.id && <MdCheck size={16} className="text-primary" />}
                </button>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <BarButton
            icon={isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            label={isDarkMode ? "日间" : "夜间"}
            onClick={() => setThemeMode(isDarkMode ? "light" : "dark")}
          />
          <SettingsDropdown phone />
        </div>
      </div>
    </div>
  );
}

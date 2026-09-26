import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useLayoutStore } from "@/store/layout-store";
import { useThemeStore } from "@/store/theme-store";
import { ChevronLeft, ChevronRight, TableOfContents } from "lucide-react";
import { useRef } from "react";
import {
  TbLayoutSidebarLeftCollapse,
  TbLayoutSidebarLeftCollapseFilled,
  TbLayoutSidebarRightCollapse,
  TbLayoutSidebarRightCollapseFilled,
} from "react-icons/tb";
import { useAutoHideControls } from "../hooks/use-auto-hide-controls";
import { useReaderStore } from "./reader-provider";
import SearchDropdown from "./search-dropdown";
import SettingsDropdown from "./settings-dropdown";
import TOCView from "./toc-view";

const HeaderBar = () => {
  const headerRef = useRef<HTMLDivElement>(null);

  const bookId = useReaderStore((state) => state.bookId);
  const bookDoc = useReaderStore((state) => state.bookData?.bookDoc);
  const progress = useReaderStore((state) => state.progress);
  const view = useReaderStore((state) => state.view);
  const openDropdown = useReaderStore((state) => state.openDropdown);
  const setOpenDropdown = useReaderStore((state) => state.setOpenDropdown);
  const section = progress?.sectionLabel || "";

  const handlePrevChapter = () => {
    view?.renderer.prevSection?.();
  };

  const handleNextChapter = () => {
    view?.renderer.nextSection?.();
  };

  const { isChatVisible, isNotepadVisible, toggleChatSidebar, toggleNotepadSidebar } = useLayoutStore();
  const { swapSidebars } = useThemeStore();

  const isTocDropdownOpen = openDropdown === "toc";

  const {
    isVisible: showControls,
    handleMouseEnter,
    handleMouseLeave,
  } = useAutoHideControls({
    keepVisible: Boolean(openDropdown),
  });

  const handleToggleTocDropdown = (isOpen: boolean) => {
    setOpenDropdown?.(isOpen ? "toc" : null);
  };

  const handleTocItemSelect = () => {
    setOpenDropdown?.(null);
  };

  return (
    <div className="w-full">
      <div
        ref={headerRef}
        className="header-bar pointer-events-auto visible flex h-10 w-full items-center px-2 pl-4 transition-all duration-300"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div
          className={`flex h-full items-center justify-start gap-x-2 transition-opacity duration-300 ${
            showControls ? "opacity-100" : "opacity-40"
          }`}
        >
          <div
            className="cursor-pointer"
            title={swapSidebars ? "显示/隐藏 AI 侧栏" : "显示/隐藏笔记侧栏"}
            onClick={swapSidebars ? toggleChatSidebar : toggleNotepadSidebar}
          >
            {(swapSidebars ? isChatVisible : isNotepadVisible) ? (
              <TbLayoutSidebarLeftCollapseFilled className="size-5 text-neutral-700 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200" />
            ) : (
              <TbLayoutSidebarLeftCollapse className="size-5 text-neutral-700 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200" />
            )}
          </div>

          <DropdownMenu open={isTocDropdownOpen} onOpenChange={handleToggleTocDropdown}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title="目录"
                className="btn btn-ghost flex h-6 w-6 items-center justify-center rounded-full p-0 outline-none focus:outline-none focus-visible:ring-0"
              >
                <TableOfContents size={18} className="text-base-content" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="max-h-[calc(100vh-8rem)] w-80 overflow-y-auto p-0"
              align="start"
              side="bottom"
              sideOffset={4}
            >
              {bookDoc?.toc ? (
                <div className="h-full">
                  <TOCView
                    toc={bookDoc.toc}
                    bookId={bookId!}
                    autoExpand={true}
                    onItemSelect={handleTocItemSelect}
                    isVisible={isTocDropdownOpen}
                  />
                </div>
              ) : (
                <div className="p-4 text-center text-muted-foreground">没有可用的目录</div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-center gap-x-1 px-2">
          <button
            type="button"
            onClick={handlePrevChapter}
            className="flex flex-shrink-0 items-center gap-1 rounded-full px-2 py-1 font-medium text-neutral-500 text-xs transition-colors hover:bg-muted/60 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-neutral-200"
            title="上一章"
          >
            <ChevronLeft className="size-3.5" />
            <span>上一章</span>
          </button>

          <span
            title={section}
            className={`min-w-0 flex-1 truncate text-center font-medium text-sm transition-colors duration-300 ${
              showControls ? "text-neutral-800 dark:text-neutral-300" : "text-neutral-500 dark:text-neutral-600"
            }`}
          >
            {section}
          </span>

          <button
            type="button"
            onClick={handleNextChapter}
            className="flex flex-shrink-0 items-center gap-1 rounded-full px-2 py-1 font-medium text-neutral-500 text-xs transition-colors hover:bg-muted/60 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-neutral-200"
            title="下一章"
          >
            <span>下一章</span>
            <ChevronRight className="size-3.5" />
          </button>
        </div>

        <div
          className={`flex h-full items-center justify-end space-x-2 ps-2 transition-opacity duration-300 ${
            showControls ? "opacity-100" : "opacity-40"
          }`}
        >
          <SearchDropdown />
          <SettingsDropdown />
          <div
            className="cursor-pointer"
            title={swapSidebars ? "显示/隐藏笔记侧栏" : "显示/隐藏 AI 侧栏"}
            onClick={swapSidebars ? toggleNotepadSidebar : toggleChatSidebar}
          >
            {(swapSidebars ? isNotepadVisible : isChatVisible) ? (
              <TbLayoutSidebarRightCollapseFilled className="size-5 text-neutral-700 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200" />
            ) : (
              <TbLayoutSidebarRightCollapse className="size-5 text-neutral-700 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HeaderBar;

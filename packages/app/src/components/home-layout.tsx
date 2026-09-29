import SettingsDialog from "@/components/settings/settings-dialog";
import { useBookUpload } from "@/hooks/use-book-upload";
import { useIsPhone } from "@/hooks/use-is-phone";
import { useSafeAreaInsets } from "@/hooks/use-safe-areaInsets";
import ChatPage from "@/pages/chat";
import LibraryPage from "@/pages/library";
import NotesPage from "@/pages/notes";
import SkillsPage from "@/pages/skills";
import StatisticsPage from "@/pages/statistics";
import { useAppSettingsStore } from "@/store/app-settings-store";
import { useLayoutStore } from "@/store/layout-store";
import { useLibraryStore } from "@/store/library-store";
import { useLlamaStore } from "@/store/llama-store";
import clsx from "clsx";
import { Upload as UploadIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Route, Routes, useLocation } from "react-router";
import Sidebar from "./sidebar";

const HomeLayout = () => {
  const { refreshBooks } = useLibraryStore();
  const { isSettingsDialogOpen, toggleSettingsDialog } = useAppSettingsStore();
  const insets = useSafeAreaInsets();
  const isPhone = useIsPhone();
  const location = useLocation();
  const isDrawerOpen = useLayoutStore((state) => state.isHomeDrawerOpen);
  const setDrawerOpen = useLayoutStore((state) => state.setHomeDrawerOpen);

  // 手机：点了抽屉里的页面 / 标签，或者打开设置，就把抽屉收起来。
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只跟着地址和设置开关走
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname, location.search, isSettingsDialogOpen]);
  const { isDragOver, handleDragOver, handleDragLeave, handleDrop } = useBookUpload();

  const isInitiating = useRef(false);
  const [libraryLoaded, setLibraryLoaded] = useState(false);

  const { hasHydrated, initializeEmbeddingService } = useLlamaStore();

  // 初始化 Embedding 服务器
  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    if (!hasHydrated) {
      console.log("等待持久化数据恢复...");
      return;
    }

    initializeEmbeddingService();
  }, [hasHydrated]);

  useEffect(() => {
    if (isInitiating.current) return;

    const initializeLibrary = async () => {
      isInitiating.current = true;
      try {
        await refreshBooks();
      } finally {
        setLibraryLoaded(true);
        isInitiating.current = false;
      }
    };

    initializeLibrary();
  }, [refreshBooks]);

  if (!insets || !libraryLoaded) {
    return null;
  }

  return (
    <div
      className={clsx(
        "flex h-full w-full rounded-xl bg-transparent p-1 py-0 transition-all duration-200",
        isDragOver && "bg-neutral-50 dark:bg-neutral-900/20",
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex h-full w-full rounded-xl border bg-background shadow-around">
        {isDragOver && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-50/80 backdrop-blur-sm dark:bg-neutral-900/40">
            <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-neutral-400 border-dashed bg-white/90 px-30 py-16 shadow-lg dark:border-neutral-500 dark:bg-neutral-800/90">
              <UploadIcon className="h-12 w-12 text-neutral-600 dark:text-neutral-400" />
              <div className="text-center">
                <h3 className="font-semibold text-lg text-neutral-900 dark:text-neutral-100">拖放文件以上传</h3>
                <p className="text-neutral-600 text-sm dark:text-neutral-400">松开以上传您的书籍</p>
              </div>
            </div>
          </div>
        )}

        {!isPhone && <Sidebar />}
        {isPhone && (
          <div
            className={clsx("fixed inset-0 z-50", isDrawerOpen ? "pointer-events-auto" : "pointer-events-none")}
            aria-hidden={!isDrawerOpen}
          >
            <div
              className={clsx(
                "absolute inset-0 bg-black/30 transition-opacity duration-200",
                isDrawerOpen ? "opacity-100" : "opacity-0",
              )}
              onClick={() => setDrawerOpen(false)}
            />
            <div
              className={clsx(
                "absolute top-0 bottom-0 left-0 flex w-64 max-w-[80vw] flex-col bg-background shadow-xl transition-transform duration-200 ease-out",
                isDrawerOpen ? "translate-x-0" : "-translate-x-full",
              )}
              style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
              inert={!isDrawerOpen || undefined}
            >
              <Sidebar className="w-full" />
            </div>
          </div>
        )}

        <div className="h-full flex-1 overflow-hidden p-1">
          <Routes>
            <Route
              path="/"
              element={
                <div className="flex h-full flex-1 flex-col rounded-xl border bg-background shadow-around">
                  <LibraryPage />
                </div>
              }
            />
            <Route
              path="/statistics"
              element={
                <div className="flex h-full flex-1 flex-col rounded-xl border bg-background shadow-around">
                  <StatisticsPage />
                </div>
              }
            />
            <Route
              path="/chat"
              element={
                <div className="flex h-full flex-1 flex-col overflow-hidden rounded-xl shadow-around">
                  <ChatPage />
                </div>
              }
            />
            <Route
              path="/notes"
              element={
                <div className="flex h-full flex-1 flex-col rounded-xl border bg-background shadow-around">
                  <NotesPage />
                </div>
              }
            />
            <Route
              path="/skills"
              element={
                <div className="flex h-full flex-1 flex-col rounded-xl border bg-background shadow-around">
                  <SkillsPage />
                </div>
              }
            />
          </Routes>
        </div>
      </div>

      <SettingsDialog open={isSettingsDialogOpen} onOpenChange={toggleSettingsDialog} />
    </div>
  );
};

export default HomeLayout;

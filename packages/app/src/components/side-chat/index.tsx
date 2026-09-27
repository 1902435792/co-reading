import { Button } from "@/components/ui/button";
import { useChatState } from "@/hooks/use-chat-state";
import { createVisibleReadingPosition } from "@/lib/reading-position";
import { useReaderStore, useReaderStoreApi } from "@/pages/reader/components/reader-provider";
import { NOVA_STATIC_AVATAR } from "@/components/nova/nova-assets";
import { openSettings } from "@/components/settings/open-settings";
import { useThemeStore } from "@/store/theme-store";
import type { ReadingFootprintTarget } from "@/types/co-reading";
import { BookOpenText, History, MessageCirclePlus, MessagesSquare, NotebookPen, Settings } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ChatContainerRoot } from "../prompt-kit/chat-container";
import { ScrollButton } from "../prompt-kit/scroll-button";
import { MindmapDialog } from "../tools/mindmap-dialog";
import { ChatInputArea } from "./chat-input-area";
import { ChatMessages } from "./chat-messages";
import { ChatThreads } from "./chat-threads";
import { CoReadingPanelV2 } from "./co-reading-panel-v2";
import ModelSelector from "./model-selector";
import { QaDiaryDialog } from "./qa-diary-dialog";

interface ChatContentProps {
  bookId?: string;
}

function ChatContent({ bookId }: ChatContentProps) {
  const readerStore = useReaderStoreApi();
  const { autoScroll } = useThemeStore();
  const [toolDetail, setToolDetail] = useState<any>(null);
  const [showMindmapDialog, setShowMindmapDialog] = useState(false);
  const [showQaDiary, setShowQaDiary] = useState(false);
  const bookTitle = useReaderStore((state) => state.bookData?.book?.title) ?? "未命名书籍";
  const setActiveContext = useReaderStore((state) => state.setActiveContext)!;
  const progress = useReaderStore((state) => state.progress);
  const activeContext = useReaderStore((state) => state.activeContext)!;
  const currentThread = useReaderStore((state) => state.currentThread);
  const setCurrentThread = useReaderStore((state) => state.setCurrentThread)!;
  const view = useReaderStore((state) => state.view);

  // CTX-01: 提取当前可视页面文本，限制长度并标记截断状态，避免系统提示词过长
  const getCurrentPageText = useCallback((): string => {
    if (!view?.renderer) return "";
    try {
      const contents = view.renderer.getContents?.();
      if (!Array.isArray(contents) || contents.length === 0) return "";
      const visibleDocs = (view.renderer.getVisibleRanges?.() ?? [])
        .map((item) => item.range?.startContainer.ownerDocument)
        .filter((doc): doc is Document => Boolean(doc));
      const docs =
        visibleDocs.length > 0
          ? [...new Set(visibleDocs)]
          : contents.map(({ doc }) => doc).filter((doc): doc is Document => Boolean(doc));
      const fullText = docs
        .map((doc) => {
          if (!doc.body) return "";
          return doc.body.innerText || doc.body.textContent || "";
        })
        .join("\n")
        .trim();
      const MAX_PAGE_TEXT_LENGTH = 2000;
      if (fullText.length > MAX_PAGE_TEXT_LENGTH) {
        return `${fullText.slice(0, MAX_PAGE_TEXT_LENGTH)}\n……（已截断）`;
      }
      return fullText;
    } catch {
      return "";
    }
  }, [view]);

  const {
    input,
    references,
    displayError,
    showThreads,
    threadsKey,
    isInit,
    messages,
    status,
    selectedModel,

    stop,
    setInput,
    setSelectedModel,
    handleAskSelection,
    handleRemoveReference,
    handleSubmit,
    handleRetry,
    handleNewThread,
    handleShowThreads,
    handleSelectThread,
    handleBackFromThreads,
    handleReasoningTimesUpdate,
  } = useChatState({
    chatContext: {
      activeBookId: bookId,
      activeContext,
      activeSectionLabel: progress?.sectionLabel,
      activePageText: getCurrentPageText(),
      activeReadingPosition: createVisibleReadingPosition({
        location: progress?.location,
        sectionIndex: progress?.sectionIndex,
        sectionLabel: progress?.sectionLabel,
        pageCurrent: progress?.pageinfo?.current,
        pageTotal: progress?.pageinfo?.total,
      }),
    },
    getLiveChatContext: () => {
      const current = readerStore.getState();
      return {
        activeBookId: bookId,
        activeContext: current.activeContext,
        activeSectionLabel: current.progress?.sectionLabel,
        activePageText: getCurrentPageText(),
        activeReadingPosition: createVisibleReadingPosition({
          location: current.progress?.location ?? current.location,
          sectionIndex: current.progress?.sectionIndex,
          sectionLabel: current.progress?.sectionLabel,
          pageCurrent: current.progress?.pageinfo?.current,
          pageTotal: current.progress?.pageinfo?.total,
        }),
      };
    },
    setActiveBookId: () => {},
    setActiveContext: setActiveContext,
    currentThread: currentThread,
    setCurrentThread: setCurrentThread,
  });

  const handleViewToolDetail = (toolPart: any) => {
    setToolDetail(toolPart);
    setShowMindmapDialog(true);
  };

  const EmptyState = () => (
    <div className="flex h-full w-full flex-col overflow-y-auto p-3 pb-6">
      <div className="flex flex-1 flex-col justify-end gap-4">
        <div className="flex items-center gap-3">
          <img
            className="size-12 rounded-full border-2 border-white shadow-md dark:border-neutral-800"
            src={NOVA_STATIC_AVATAR}
            alt=""
          />
          <div>
            <h3 className="font-semibold text-lg text-neutral-900 dark:text-neutral-50">问问这本书</h3>
            <p className="text-muted-foreground text-xs">会结合你正在读的位置回答；选中文字后可以直接追问。</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[
            "总结一下这一章讲了什么",
            "这一页有哪些关键概念？",
            "解释一下我刚读到的这段",
            "这部分和前面的内容有什么联系？",
          ].map((prompt) => (
            <button
              key={prompt}
              type="button"
              className="rounded-full border bg-background px-3 py-1 text-muted-foreground text-xs transition hover:border-primary/40 hover:text-foreground"
              onClick={() => setInput(prompt)}
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <main className="flex h-full flex-col overflow-hidden">
      <div className="ml-1 flex-shrink-0 border-neutral-300 dark:border-neutral-700">
        <div className="flex h-8 items-center justify-between">
          <div className="flex items-center gap-2 pl-0.5">
            <ModelSelector
              selectedModel={selectedModel}
              onModelSelect={setSelectedModel}
              className="z-40 w-[12rem] flex-shrink-0"
            />
          </div>
          <div className="flex items-center gap-0">
            <Button
              variant="ghost"
              size="icon"
              className="z-40 size-7 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-700"
              title="新对话"
              aria-label="新对话"
              onClick={handleNewThread}
            >
              <MessageCirclePlus className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="z-40 size-7 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-700"
              title="历史对话"
              aria-label="历史对话"
              onClick={handleShowThreads}
            >
              <History className="h-5 w-5" />
            </Button>
            {bookId && (
              <Button
                variant="ghost"
                size="icon"
                className="z-40 size-7 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-700"
                title="写问答日记（记进 VCP）"
                aria-label="写问答日记"
                disabled={messages.length === 0}
                onClick={() => setShowQaDiary(true)}
              >
                <NotebookPen className="h-5 w-5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="z-40 size-7 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-700"
              title="设置（模型提供商）"
              aria-label="设置"
              onClick={() => openSettings("model-providers")}
            >
              <Settings className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
      {showThreads && bookId ? (
        <ChatThreads
          key={`threads-${threadsKey}`}
          bookId={bookId}
          onBack={handleBackFromThreads}
          onSelectThread={handleSelectThread}
        />
      ) : messages.length === 0 && isInit.current ? (
        <EmptyState />
      ) : (
        <ChatContainerRoot className="relative flex-1" autoScroll={autoScroll}>
          <ChatMessages
            messages={messages}
            status={status}
            error={displayError}
            autoScroll={autoScroll}
            scrollKey={currentThread?.id ?? "__init__"}
            onReasoningTimesUpdate={handleReasoningTimesUpdate}
            onRetry={handleRetry}
            canRetry={status === "ready" && !!displayError}
            onAskSelection={handleAskSelection}
            onViewToolDetail={handleViewToolDetail}
          />
          <div className="-translate-x-1/2 pointer-events-none absolute bottom-4 left-1/2 flex w-full max-w-3xl justify-end px-5">
            <div className="pointer-events-auto">
              <ScrollButton />
            </div>
          </div>
        </ChatContainerRoot>
      )}

      {!showThreads && bookId && (
        <ChatInputArea
          input={input}
          setInput={setInput}
          references={references}
          onRemoveReference={handleRemoveReference}
          onSubmit={handleSubmit}
          onStop={stop}
          status={status}
          activeBookId={bookId}
          setActiveBookId={() => {}}
        />
      )}

      {bookId && (
        <QaDiaryDialog
          open={showQaDiary}
          onOpenChange={setShowQaDiary}
          bookId={bookId}
          bookTitle={bookTitle}
          sectionLabel={progress?.sectionLabel}
          messages={messages}
        />
      )}
      <MindmapDialog open={showMindmapDialog} onOpenChange={setShowMindmapDialog} toolPart={toolDetail} />
    </main>
  );
}

type SideChatMode = "chat" | "co-reading";

export default function SideChat({ bookId }: ChatContentProps) {
  const storageKey = `deepreader:side-chat-mode:${bookId ?? "global"}`;
  const readingFootprintTarget = useReaderStore(
    (state) => state.pendingReadingFootprint,
  ) as ReadingFootprintTarget | null;
  const [mode, setMode] = useState<SideChatMode>(() => {
    if (readingFootprintTarget) return "co-reading";
    const saved = window.localStorage.getItem(storageKey);
    return saved === "co-reading" ? "co-reading" : "chat";
  });

  useEffect(() => {
    window.localStorage.setItem(storageKey, mode);
  }, [mode, storageKey]);

  useEffect(() => {
    if (!readingFootprintTarget || readingFootprintTarget.bookId !== bookId) return;
    setMode("co-reading");
    window.localStorage.setItem(`deepreader:co-reading-expanded:${readingFootprintTarget.bookId}`, "true");
  }, [bookId, readingFootprintTarget]);

  return (
    <div id="chat-sidebar" className="flex h-full flex-col overflow-hidden bg-background">
      <div className="border-b px-2 py-1.5">
        <div className="grid grid-cols-2 gap-0.5 rounded-lg bg-muted p-0.5">
          <button
            type="button"
            title="问答：就书中内容提问"
            className={`flex h-7 items-center justify-center gap-1.5 rounded-md text-xs transition-all ${
              mode === "chat"
                ? "bg-background font-medium text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setMode("chat")}
          >
            <MessagesSquare className="size-3.5" />
            问答
          </button>
          <button
            type="button"
            title="共读：Nova 跟着你读，写边注"
            className={`flex h-7 items-center justify-center gap-1.5 rounded-md text-xs transition-all ${
              mode === "co-reading"
                ? "bg-background font-medium text-primary shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setMode("co-reading")}
          >
            <BookOpenText className="size-3.5" />
            共读
          </button>
        </div>
      </div>
      <div className={mode === "chat" ? "dr-rise-in min-h-0 flex-1" : "hidden"}>
        <ChatContent bookId={bookId} />
      </div>
      {mode === "co-reading" && bookId && (
        <div className="dr-rise-in flex min-h-0 flex-1 flex-col">
          <CoReadingPanelV2 bookId={bookId} readingFootprintTarget={readingFootprintTarget} />
        </div>
      )}
    </div>
  );
}

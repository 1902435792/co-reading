import { PromptInput, PromptInputAction, PromptInputTextarea } from "@/components/prompt-kit/prompt-input";
import { Button } from "@/components/ui/button";
import { useIsChatPage } from "@/hooks/use-is-chat-page";
import { getSkills, type Skill } from "@/services/skill-service";
import type { ChatReference } from "@/types/message";
import { ArrowUp, BookOpen, Brain, Compass, FileText, Paperclip, Quote, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ContextPopover } from "./context-popover";

interface ChatInputAreaProps {
  references: ChatReference[];
  input: string;
  status: string;
  activeBookId: string | undefined;
  showToolDetail?: boolean;

  setInput: (value: string) => void;
  onRemoveReference: (id: string) => void;
  onSubmit: (promptOverride?: string) => Promise<void>;
  onStop: () => void;
  setActiveBookId: (bookId: string | undefined) => void;
  /** 点快捷按钮时登记要附带的材料（本章原文 / 目录）。 */
  onQuickExtras?: (extras: QuickExtra[]) => void;
}

/** 快捷按钮发送时要附带的材料：chapter = 本章从开头到当前位置的原文，toc = 全书目录。 */
export type QuickExtra = "chapter" | "toc";

/**
 * QuickAction：只放不需要额外用户输入的动作。
 * 需要输入的（解释概念等）走斜杠命令。
 */
const QUICK_ACTIONS: readonly {
  label: string;
  icon: typeof BookOpen;
  tone: string;
  prompt: string;
  extras: QuickExtra[];
}[] = [
  {
    label: "总结本章",
    icon: BookOpen,
    tone: "text-sky-600 dark:text-sky-400",
    prompt:
      "帮我总结这一章从开头到我现在读到的地方：核心观点、推理脉络、关键结论，最后留一两个值得带着读下去的问题。只根据附带的本章原文，别剧透后面。",
    extras: ["chapter"],
  },
  {
    label: "知识图谱",
    icon: Brain,
    tone: "text-violet-600 dark:text-violet-400",
    prompt:
      "用 Mermaid 画出这一章到目前为止的概念关系图：节点用简短的中文概念，连线上写清关系，控制在 15 个节点以内，只画原文里真的出现的内容。图后用两三句话说说最关键的那条线索。",
    extras: ["chapter"],
  },
  {
    label: "笔记格式化",
    icon: FileText,
    tone: "text-emerald-600 dark:text-emerald-400",
    prompt:
      "把我们这次的对话整理成一篇 Obsidian 笔记：标题、书名和章节、我的问题和你回答的要点、提到的原文摘录（照抄并注明章节）、我的想法、还想继续想的问题。先给我看，我确认后再保存。",
    extras: [],
  },
  {
    label: "预读导航",
    icon: Compass,
    tone: "text-amber-600 dark:text-amber-400",
    prompt:
      "根据附带的全书目录帮我做一个预读导航：这本书大概在讲什么、分成哪几部分、每部分起什么作用、哪些章节值得细读、哪些可以略读，再给一条阅读路线。只根据书名和目录，不要编造具体内容，不剧透结局。",
    extras: ["toc"],
  },
];

export function ChatInputArea({
  input,
  status,
  references,
  activeBookId,
  showToolDetail = false,

  setActiveBookId,
  onQuickExtras,
  onRemoveReference,
  onSubmit,
  onStop,
  setInput,
}: ChatInputAreaProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isChatPage = useIsChatPage();

  // 斜杠命令状态
  const [slashSkills, setSlashSkills] = useState<Skill[]>([]);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0); // 键盘选中索引

  // 每次打开斜杠菜单时重新拉取技能，保证新建技能立即出现
  const loadSkills = useCallback(async () => {
    try {
      const all = await getSkills();
      setSlashSkills(all.filter((s) => s.isActive && !s.isSystem));
    } catch { /* 静默 */ }
  }, []);

  // 初次加载
  useEffect(() => {
    void loadSkills();
  }, [loadSkills]);

  // 过滤列表
  const slashQuery = input.startsWith("/") ? input.slice(1).split(" ")[0].toLowerCase() : "";
  const filteredSkills = showSlashMenu
    ? slashSkills.filter((s) => s.name.toLowerCase().includes(slashQuery))
    : [];

  // 检测 / 触发斜杠菜单
  const handleInputChange = useCallback(
    (value: string) => {
      setInput(value);
      const hasSelected = slashSkills.some((s) => value.startsWith(`/${s.name} `));
      const isSlash = value.startsWith("/") && !hasSelected && !value.includes(" ");
      if (isSlash && !showSlashMenu) {
        // 重新拉取，保证包含最新技能
        void loadSkills();
      }
      setShowSlashMenu(isSlash);
      setActiveIndex(0);
    },
    [setInput, slashSkills, showSlashMenu, loadSkills],
  );

  const handleQuickPrompt = (prompt: string, extras: QuickExtra[]) => {
    onQuickExtras?.(extras);
    setInput(prompt);
    if (status === "ready") {
      void onSubmit(prompt);
    }
  };

  // 斜杠选中技能 → 填入前缀，用户继续输入
  const handleSlashSelect = useCallback((skill: Skill) => {
    setShowSlashMenu(false);
    setActiveIndex(0);
    setInput(`/${skill.name} `);
  }, [setInput]);

  /** 发送时：将 /技能名 用户内容 转换为实际 prompt */
  const transformSlashInput = useCallback(
    (raw: string): string => {
      if (!raw.startsWith("/")) return raw;
      const match = slashSkills.find((s) => raw.startsWith(`/${s.name}`));
      if (!match) return raw;
      const userInput = raw.slice(`/${match.name}`.length).trim();
      return userInput
        ? `请执行「${match.name}」技能：${userInput}`
        : `请执行「${match.name}」技能。`;
    },
    [slashSkills],
  );

  const handleSubmitWithTransform = useCallback(() => {
    setShowSlashMenu(false);
    const transformed = transformSlashInput(input);
    setInput(transformed);
    void onSubmit(transformed);
  }, [input, transformSlashInput, onSubmit, setInput]);

  // 键盘导航
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!showSlashMenu || filteredSkills.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1) % filteredSkills.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev) => (prev - 1 + filteredSkills.length) % filteredSkills.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const selected = filteredSkills[activeIndex];
        if (selected) handleSlashSelect(selected);
      } else if (e.key === "Escape") {
        setShowSlashMenu(false);
      }
    },
    [showSlashMenu, filteredSkills, activeIndex, handleSlashSelect],
  );

  const renderQuickButtons = () =>
    QUICK_ACTIONS.map(({ label, icon: Icon, tone, prompt, extras }) => (
      <PromptInputAction key={label} tooltip={label}>
        <button
          type="button"
          disabled={status !== "ready"}
          className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border border-border/70 bg-background/80 px-2.5 text-foreground/80 text-xs shadow-sm transition-colors hover:border-primary/40 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => handleQuickPrompt(prompt, extras)}
        >
          <Icon className={`size-3.5 ${tone}`} />
          {!showToolDetail && <span>{label}</span>}
        </button>
      </PromptInputAction>
    ));

  return (
    <div className="z-10 shrink-0 px-2 pr-0 pl-1.5">
      {!isChatPage && (
        <div className="flex items-center justify-between gap-2 py-2">
          <div className="flex flex-wrap items-center gap-2">
            {renderQuickButtons()}
          </div>
        </div>
      )}
      <div className="mx-auto max-w-3xl">
        <PromptInput
          isLoading={status !== "ready"}
          value={input}
          onValueChange={handleInputChange}
          onSubmit={handleSubmitWithTransform}
          className="relative z-10 w-full rounded-2xl border bg-card shadow-around transition-shadow duration-200 focus-within:shadow-md"
        >
          {isChatPage && (
            <div className="flex items-center justify-between gap-2 py-2">
              <ContextPopover activeBookId={activeBookId} setActiveBookId={setActiveBookId} />
              <div className="flex flex-wrap items-center gap-2">
                {renderQuickButtons()}
              </div>
            </div>
          )}

          {/* 斜杠命令菜单 */}
          {showSlashMenu && filteredSkills.length > 0 && (
            <div className="border-border border-t p-1">
              <p className="px-2 py-1 text-muted-foreground text-xs">↑↓ 选择，Enter 确认，Esc 关闭</p>
              {filteredSkills.map((skill, index) => (
                <button
                  key={skill.id}
                  type="button"
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                    index === activeIndex
                      ? "bg-primary/10 text-primary dark:bg-primary/20"
                      : "hover:bg-accent hover:bg-muted"
                  }`}
                  onClick={() => handleSlashSelect(skill)}
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  <span className="text-muted-foreground text-xs">/</span>
                  <span className="font-medium">{skill.name}</span>
                </button>
              ))}
            </div>
          )}

          {references.length > 0 && (
            <div className="my-1 flex flex-col">
              {references.map((reference) => (
                <div
                  key={reference.id}
                  className="group flex w-full items-start gap-2 rounded-xl border border-border bg-muted/70 p-2 text-xs"
                >
                  <Quote className="mt-[1px] size-3.5 text-muted-foreground" />
                  <span className="flex-1 whitespace-pre-wrap break-words text-left text-foreground">
                    {reference.text}
                  </span>
                  <button
                    type="button"
                    className="mt-0.5 text-muted-foreground transition-colors hover:text-foreground"
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemoveReference(reference.id);
                    }}
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <PromptInputTextarea
            placeholder="问我任何问题... 输入 / 查看技能"
            className="flex-1 bg-transparent py-2 pl-2 text-foreground text-sm leading-[1.3] placeholder:font-light placeholder:text-muted-foreground"
            onKeyDown={handleKeyDown}
          />
          <div className="flex items-center justify-between gap-2">
            <input ref={fileInputRef} type="file" multiple className="hidden" />
            <PromptInputAction tooltip="上传文件">
              <Button
                variant="outline"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                className="size-8 rounded-full hover:bg-accent dark:border-border"
              >
                <Paperclip className="size-4" />
              </Button>
            </PromptInputAction>

            <Button
              type="submit"
              size="icon"
              disabled={status === "ready" ? !input.trim() : status !== "submitted" && status !== "streaming"}
              onClick={() => {
                if (status === "ready") {
                  handleSubmitWithTransform();
                } else {
                  onStop();
                }
              }}
              className="size-8 rounded-full"
            >
              {status === "ready" ? (
                <ArrowUp size={18} />
              ) : (
                <span className="size-2 rounded-xs bg-white dark:bg-neutral-900" />
              )}
            </Button>
          </div>
        </PromptInput>
      </div>
    </div>
  );
}

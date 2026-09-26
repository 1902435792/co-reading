import { getAnnotationSourceTarget } from "@/components/side-chat/co-reading-backlink";
import { EMPTY_BOOK_NOTES, selectBookNotes } from "@/components/side-chat/co-reading-panel-state";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useReaderStore } from "@/pages/reader/components/reader-provider";
import { useImmersiveStore } from "@/store/immersive-store";
import { SessionState } from "@/types/reading-session";
import type { BookNote } from "@/types/book";
import type { CoReadingSourceTarget } from "@/types/co-reading";
import { AnimatePresence, motion, useMotionValue, useReducedMotion } from "framer-motion";
import { ChevronRight, Minus, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { classifyNovaReactionWithJev } from "@/services/jev-service";
import { NOVA_IMAGE_BY_NAME, NOVA_LATE_NIGHT_IMAGE, NOVA_STATIC_AVATAR, pickNovaImage } from "./nova-assets";
import { setNovaCompanionMode, useNovaCompanionMode } from "./nova-companion-mode";
import { useNovaExtras } from "./nova-extras";
import { NOVA_ONE_SHOT_MOODS, type NovaMood, buildNovaAnimation } from "./nova-lottie";
import { NovaLottiePlayer } from "./nova-lottie-player";
import { deriveNovaMood, getAnnotationReaction, pickNovaLine, shortenNovaText } from "./nova-mood";
import { activeMsFromStats, formatActiveDuration, isLateNight } from "./nova-moments";

interface NovaBubble {
  id: number;
  kind: "annotation" | "info" | "error";
  text: string;
  quote?: string;
  target?: CoReadingSourceTarget;
  /** 自动隐藏的毫秒数；0 表示一直显示，直到被替换。 */
  ttl: number;
}

interface NovaReaction {
  mood: NovaMood;
  until: number;
  /** Jev 挑出的具体表情；不填时按 mood 随机选。 */
  image?: string;
}

const POSITION_KEY = "deepreader:nova-companion-position";
const COLLAPSED_KEY = "deepreader:nova-companion-collapsed";

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function isAiAnnotation(note: BookNote) {
  return note.author === "ai" && !note.deletedAt && !note.sourceNoteId;
}

/** 打字机效果：减少动态效果时直接显示全文。 */
function useTypewriter(text: string, enabled: boolean) {
  const [count, setCount] = useState(enabled ? 0 : text.length);
  useEffect(() => {
    if (!enabled) {
      setCount(text.length);
      return;
    }
    setCount(0);
    const step = Math.max(1, Math.ceil(text.length / 90));
    const timer = window.setInterval(() => {
      setCount((current) => {
        const next = Math.min(text.length, current + step);
        if (next >= text.length) window.clearInterval(timer);
        return next;
      });
    }, 28);
    return () => window.clearInterval(timer);
  }, [text, enabled]);
  return text.slice(0, count);
}

interface NovaCompanionProps {
  bookId: string | null;
  isTabVisible: boolean;
}

export function NovaCompanion({ bookId, isTabVisible }: NovaCompanionProps) {
  const mode = useNovaCompanionMode();
  const snapshot = useReaderStore((state) => state.coReadingSnapshot);
  const runtime = useReaderStore((state) => state.coReadingRuntime);
  const status = snapshot?.settings.status ?? "off";
  if (!bookId || !snapshot || !runtime || status === "off" || mode === "off") {
    return null;
  }
  return <NovaCompanionInner bookId={bookId} isTabVisible={isTabVisible} showAvatar={mode === "full"} />;
}

function NovaCompanionInner({
  bookId,
  isTabVisible,
  showAvatar,
}: { bookId: string; isTabVisible: boolean; showAvatar: boolean }) {
  const snapshot = useReaderStore((state) => state.coReadingSnapshot)!;
  const runtime = useReaderStore((state) => state.coReadingRuntime)!;
  const sessionStats = useReaderStore((state) => state.sessionStats);
  const extras = useNovaExtras();
  const immersive = useImmersiveStore((state) => state.immersive);
  const toggleImmersive = useImmersiveStore((state) => state.toggleImmersive);
  const notes = useReaderStore(selectBookNotes) ?? EMPTY_BOOK_NOTES;
  const location = useReaderStore((state) => state.location);
  const bookTitle = useReaderStore((state) => state.bookData?.book?.title) ?? "这本书";
  const setPendingCoReadingSource = useReaderStore((state) => state.setPendingCoReadingSource);
  const reducedMotion = useReducedMotion() ?? false;

  const boundsRef = useRef<HTMLDivElement>(null);
  const savedPosition = useMemo(() => readJson(POSITION_KEY, { x: 0, y: 0 }), []);
  const x = useMotionValue(savedPosition.x);
  const y = useMotionValue(savedPosition.y);

  const [collapsed, setCollapsed] = useState(() => readJson(COLLAPSED_KEY, false));
  const [reaction, setReaction] = useState<NovaReaction | null>(null);
  const [bubble, setBubble] = useState<NovaBubble | null>(null);
  // 最近一条边注，关掉后可以从右键菜单再打开。
  const [lastAnnotation, setLastAnnotation] = useState<NovaBubble | null>(null);
  // 用户关掉暂停/打盹台词时记下当时的状态，状态变化前不再弹出。
  const [dismissedFallbackMood, setDismissedFallbackMood] = useState<NovaMood | null>(null);
  const [unread, setUnread] = useState(false);
  const [lastActivityAt, setLastActivityAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [pageVisible, setPageVisible] = useState(() => !document.hidden);
  const seedRef = useRef(Math.floor(Math.random() * 1000));
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const draggedRef = useRef(false);
  const bubbleIdRef = useRef(0);

  const nextSeed = () => {
    seedRef.current += 1 + Math.floor(Math.random() * 7);
    return seedRef.current;
  };

  const say = useCallback(
    (next: Omit<NovaBubble, "id">) => {
      bubbleIdRef.current += 1;
      setBubble({ ...next, id: bubbleIdRef.current });
      if (next.kind === "annotation") setLastAnnotation({ ...next, id: bubbleIdRef.current });
      if (collapsed && next.kind !== "info") setUnread(true);
    },
    [collapsed],
  );
  const react = useCallback((mood: NovaMood, durationMs: number) => {
    setReaction({ mood, until: Date.now() + durationMs });
  }, []);

  // 时钟：用于打盹判定和结束短暂反应。
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5_000);
    const onVisibility = () => setPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  useEffect(() => {
    if (!reaction) return;
    const timer = window.setTimeout(() => setReaction(null), Math.max(0, reaction.until - Date.now()));
    return () => window.clearTimeout(timer);
  }, [reaction]);
  useEffect(() => {
    if (!bubble || bubble.ttl <= 0) return;
    const timer = window.setTimeout(
      () => setBubble((current) => (current?.id === bubble.id ? null : current)),
      bubble.ttl,
    );
    return () => window.clearTimeout(timer);
  }, [bubble]);
  useEffect(() => {
    window.localStorage.setItem(COLLAPSED_KEY, JSON.stringify(collapsed));
    if (!collapsed) setUnread(false);
  }, [collapsed]);

  // 翻页 = 有活动，叫醒 Nova。
  // biome-ignore lint/correctness/useExhaustiveDependencies: location 变化本身就是触发条件
  useEffect(() => {
    setLastActivityAt(Date.now());
  }, [location]);

  // 打招呼。
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在打开书时触发一次
  useEffect(() => {
    react("greet", 2_600);
    const late = extras.lateNight && isLateNight(new Date());
    say({
      kind: "info",
      text: late ? pickNovaLine("lateGreet", nextSeed()) : pickNovaLine("greet", nextSeed(), { title: bookTitle }),
      ttl: 6_000,
    });
  }, [bookId]);

  // 深夜：每 45 分钟提醒一次休息（只在空闲、没有气泡时）。
  const lastRestReminderRef = useRef(Date.now());
  // biome-ignore lint/correctness/useExhaustiveDependencies: 每次时钟跳动检查一次
  useEffect(() => {
    if (!extras.lateNight || !isLateNight(new Date(now))) return;
    if (now - lastRestReminderRef.current < 45 * 60_000 || bubble || collapsed) return;
    lastRestReminderRef.current = now;
    say({ kind: "info", text: pickNovaLine("lateRest", nextSeed()), ttl: 8_000 });
  }, [now]);

  // 沉浸阅读时缩成小头像，退出后恢复原来的样子。
  const collapsedBeforeImmersiveRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (immersive) {
      setCollapsed((current) => {
        collapsedBeforeImmersiveRef.current = current;
        return true;
      });
    } else if (collapsedBeforeImmersiveRef.current !== null) {
      setCollapsed(collapsedBeforeImmersiveRef.current);
      collapsedBeforeImmersiveRef.current = null;
    }
  }, [immersive]);

  // 新边注：打开书之前已有的边注不播报。
  const knownNoteIdsRef = useRef<Set<string> | null>(null);
  const latestAnnotationIdRef = useRef<string | null>(null);
  useEffect(() => {
    const aiNotes = notes.filter(isAiAnnotation);
    if (!knownNoteIdsRef.current) {
      knownNoteIdsRef.current = new Set(aiNotes.map((note) => note.id));
      return;
    }
    const known = knownNoteIdsRef.current;
    const fresh = aiNotes.filter((note) => !known.has(note.id));
    for (const note of fresh) known.add(note.id);
    if (fresh.length === 0) return;
    const newest = [...fresh].sort((a, b) => b.createdAt - a.createdAt)[0]!;
    const block = snapshot.blocks.find((item) => item.annotationId === newest.id);
    const mood = fresh.length > 1 ? "found" : getAnnotationReaction(newest.note);
    react(mood, 5_000);
    // 可选：让 Jev 根据书评情绪换一张更贴切的表情（未开启或失败时保持上面的表情）。
    latestAnnotationIdRef.current = newest.id;
    void classifyNovaReactionWithJev(newest.text ?? "", newest.note ?? "").then((choice) => {
      if (!choice || latestAnnotationIdRef.current !== newest.id) return;
      const image = NOVA_IMAGE_BY_NAME[choice.image];
      setReaction({ mood: choice.mood, until: Date.now() + 5_000, image });
    });
    const noteText = newest.note || "我在这里留了一条边注～";
    say({
      kind: "annotation",
      text: fresh.length > 1 ? `${noteText}\n\n（这一页一共留了 ${fresh.length} 条边注）` : noteText,
      quote: newest.text ? shortenNovaText(newest.text, 60) : undefined,
      target: getAnnotationSourceTarget(bookId, newest, block),
      ttl: 20_000,
    });
    setLastActivityAt(Date.now());
  }, [notes, bookId, react, say, snapshot.blocks]);

  // 开始思考 / 读完一页但没有留言。
  const processingRef = useRef({ active: false, annotatedAtStart: 0 });
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只关心 isProcessing 的切换
  useEffect(() => {
    const state = processingRef.current;
    if (runtime.isProcessing && !state.active) {
      state.active = true;
      state.annotatedAtStart = snapshot.stats.annotated;
      say({ kind: "info", text: pickNovaLine("thinking", nextSeed()), ttl: 0 });
      return;
    }
    if (!runtime.isProcessing && state.active) {
      state.active = false;
      const annotatedAtStart = state.annotatedAtStart;
      const timer = window.setTimeout(() => {
        const latest = processingRef.current;
        if (latest.active) return;
        setBubble((current) => (current?.kind === "info" && current.ttl === 0 ? null : current));
        if (!runtime.error && snapshotRef.current.stats.annotated <= annotatedAtStart) {
          react("silent", 3_500);
          say({ kind: "info", text: pickNovaLine("silent", nextSeed()), ttl: 5_000 });
        }
      }, 1_200);
      return () => window.clearTimeout(timer);
    }
  }, [runtime.isProcessing]);
  // 出错。
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在错误文字变化时播报
  useEffect(() => {
    if (!runtime.error) return;
    say({
      kind: "error",
      text: `${pickNovaLine("error", nextSeed())}：${shortenNovaText(runtime.error)}`,
      ttl: 12_000,
    });
  }, [runtime.error]);

  const activeReaction = reaction?.mood ?? null;
  const mood = deriveNovaMood({
    status: snapshot.settings.status,
    isProcessing: runtime.isProcessing,
    error: runtime.error,
    idleMs: now - lastActivityAt,
    reaction: activeReaction,
  });

  // 每次换状态随机换一张表情。
  const [imageSeed, setImageSeed] = useState(() => nextSeed());
  // biome-ignore lint/correctness/useExhaustiveDependencies: 状态变化时换表情
  useEffect(() => setImageSeed(nextSeed()), [mood]);
  // 状态变了（翻页、恢复共读等），之前关掉的暂停/打盹台词可以重新出现。
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在状态变化时重置
  useEffect(() => setDismissedFallbackMood(null), [mood]);
  const lateNightIdle = extras.lateNight && mood === "idle" && isLateNight(new Date(now));
  const imageUrl =
    reaction?.image && reaction.mood === mood
      ? reaction.image
      : lateNightIdle
        ? NOVA_LATE_NIGHT_IMAGE
        : pickNovaImage(mood, imageSeed);
  const animationData = useMemo(() => buildNovaAnimation(mood, imageUrl), [mood, imageUrl]);

  const onPet = () => {
    if (draggedRef.current) return;
    if (collapsed) {
      setCollapsed(false);
      return;
    }
    react("pet", 2_200);
    if (!bubble || bubble.kind !== "annotation") {
      say({ kind: "info", text: pickNovaLine("pet", nextSeed()), ttl: 3_000 });
    }
  };
  const openSource = () => {
    if (bubble?.target) setPendingCoReadingSource?.(bubble.target);
  };
  const savePosition = () => {
    window.localStorage.setItem(POSITION_KEY, JSON.stringify({ x: x.get(), y: y.get() }));
  };
  const resetPosition = () => {
    x.set(0);
    y.set(0);
    savePosition();
  };
  const closeBubble = () => {
    setBubble(null);
    setDismissedFallbackMood(mood);
  };
  const reopenLastAnnotation = () => {
    if (!lastAnnotation) return;
    bubbleIdRef.current += 1;
    setCollapsed(false);
    setUnread(false);
    // 手动打开的边注不自动消失，点 × 才关。
    setBubble({ ...lastAnnotation, id: bubbleIdRef.current, ttl: 0 });
  };

  const sayReadingTime = () => {
    const activeMs = activeMsFromStats(
      sessionStats
        ? {
            totalActiveTime: sessionStats.totalActiveTime,
            lastActivityTime: sessionStats.lastActivityTime,
            isActive: sessionStats.currentState === SessionState.ACTIVE,
          }
        : null,
      Date.now(),
    );
    setCollapsed(false);
    say({ kind: "info", text: `这次已经一起读了 ${formatActiveDuration(activeMs)}～`, ttl: 5_000 });
  };

  const playing = isTabVisible && pageVisible;
  const fallbackAllowed = !bubble && dismissedFallbackMood !== mood;
  const sleepyLine = mood === "sleep" && fallbackAllowed ? pickNovaLine("sleep", imageSeed) : null;
  const pausedLine = mood === "paused" && fallbackAllowed ? pickNovaLine("paused", 0) : null;
  const shownBubble: NovaBubble | null =
    bubble ?? (sleepyLine || pausedLine ? { id: -1, kind: "info", text: (sleepyLine ?? pausedLine)!, ttl: 0 } : null);
  const avatarSize = collapsed ? 48 : showAvatar ? 120 : 44;

  return (
    <div ref={boundsRef} className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      <motion.div
        drag
        dragMomentum={false}
        dragConstraints={boundsRef}
        dragElastic={0.08}
        onDragStart={() => {
          draggedRef.current = true;
        }}
        onDragEnd={() => {
          savePosition();
          window.setTimeout(() => {
            draggedRef.current = false;
          }, 120);
        }}
        style={{ x, y }}
        className="group pointer-events-auto absolute right-4 bottom-14 flex flex-col items-end"
      >
        <AnimatePresence mode="wait">
          {!collapsed && shownBubble && (
            <NovaSpeechBubble
              key={shownBubble.id}
              bubble={shownBubble}
              reducedMotion={reducedMotion}
              onClose={closeBubble}
              onOpenSource={openSource}
            />
          )}
        </AnimatePresence>

        <div className="relative" style={{ width: avatarSize, height: avatarSize }}>
          {!collapsed && (
            <div className="-top-1 -left-1 absolute z-10 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
              <button
                type="button"
                title="收起 Nova"
                aria-label="收起 Nova"
                className="flex size-5 items-center justify-center rounded-full border bg-background/90 text-muted-foreground shadow-sm hover:text-foreground"
                onClick={() => setCollapsed(true)}
              >
                <Minus className="size-3" />
              </button>
              <button
                type="button"
                title="隐藏 Nova（可在共读面板重新打开）"
                aria-label="隐藏 Nova"
                className="flex size-5 items-center justify-center rounded-full border bg-background/90 text-muted-foreground shadow-sm hover:text-foreground"
                onClick={() => setNovaCompanionMode("off")}
              >
                <X className="size-3" />
              </button>
            </div>
          )}
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <motion.div
                role="button"
                tabIndex={0}
                aria-label={collapsed ? "展开 Nova" : "摸摸 Nova"}
                title={collapsed ? "展开 Nova · 右键更多" : "摸摸头 · 拖动可移动 · 右键更多"}
                onTap={onPet}
                onDoubleClick={resetPosition}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onPet();
                  }
                }}
                whileHover={reducedMotion ? undefined : { scale: 1.04 }}
                whileTap={reducedMotion ? undefined : { scale: 0.95 }}
                className="size-full cursor-grab select-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
              >
                {showAvatar && !collapsed ? (
                  <NovaLottiePlayer
                    data={animationData}
                    loop={!NOVA_ONE_SHOT_MOODS.has(mood)}
                    playing={playing}
                    fallbackSrc={imageUrl}
                    reducedMotion={reducedMotion}
                  />
                ) : (
                  <img
                    src={collapsed ? imageUrl : NOVA_STATIC_AVATAR}
                    alt="Nova"
                    draggable={false}
                    className="size-full rounded-full border-2 border-white shadow-lg"
                  />
                )}
              </motion.div>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-48">
              <ContextMenuItem disabled={!lastAnnotation} onSelect={reopenLastAnnotation}>
                再看刚才的边注
              </ContextMenuItem>
              <ContextMenuItem onSelect={onPet}>{collapsed ? "展开 Nova" : "摸摸 Nova"}</ContextMenuItem>
              {!immersive && <ContextMenuItem onSelect={sayReadingTime}>这次读了多久</ContextMenuItem>}
              <ContextMenuSeparator />
              <ContextMenuItem onSelect={toggleImmersive}>{immersive ? "退出沉浸阅读" : "沉浸阅读"}</ContextMenuItem>
              {!collapsed && <ContextMenuItem onSelect={() => setCollapsed(true)}>收起</ContextMenuItem>}
              <ContextMenuItem onSelect={resetPosition}>复位位置</ContextMenuItem>
              <ContextMenuItem onSelect={() => setNovaCompanionMode("off")}>隐藏 Nova</ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
          {collapsed && unread && (
            <span className="absolute top-0 right-0 size-3 animate-pulse rounded-full border-2 border-background bg-rose-500" />
          )}
        </div>
      </motion.div>
    </div>
  );
}

function NovaSpeechBubble({
  bubble,
  reducedMotion,
  onClose,
  onOpenSource,
}: {
  bubble: NovaBubble;
  reducedMotion: boolean;
  onClose: () => void;
  onOpenSource: () => void;
}) {
  const typed = useTypewriter(bubble.text, !reducedMotion);
  const isAnnotation = bubble.kind === "annotation" && bubble.target;
  const tone =
    bubble.kind === "error"
      ? "border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950/80 dark:text-rose-100"
      : bubble.kind === "annotation"
        ? "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/80 dark:text-amber-50"
        : "border-border bg-background text-foreground";
  const content = (
    <>
      <span className="mb-1 flex items-center gap-1 font-semibold text-[11px] opacity-70">
        Nova{bubble.kind === "annotation" ? " · 新边注" : bubble.kind === "error" ? " · 出错了" : ""}
      </span>
      {bubble.quote && (
        <span className="mb-1.5 line-clamp-2 block border-black/15 border-l-2 pl-2 text-[11px] opacity-70 dark:border-white/25">
          {bubble.quote}
        </span>
      )}
      <span className="line-clamp-6 block whitespace-pre-line leading-relaxed">
        {typed}
        {typed.length < bubble.text.length && <span className="ml-0.5 inline-block w-1 animate-pulse">▍</span>}
      </span>
      {isAnnotation && (
        <span className="mt-1.5 flex items-center justify-end font-medium text-[11px] text-amber-700 dark:text-amber-300">
          查看原文
          <ChevronRight className="size-3" />
        </span>
      )}
    </>
  );
  return (
    <motion.div
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 420, damping: 28 }}
      style={{ transformOrigin: "bottom right" }}
      className="relative mr-6 mb-2 w-64 max-w-[70vw]"
      onPointerDownCapture={(event) => event.stopPropagation()}
    >
      <div className={`relative rounded-2xl border-2 px-3 py-2 text-xs shadow-lg ${tone}`}>
        <button
          type="button"
          aria-label="关闭气泡"
          className="absolute top-1.5 right-1.5 rounded-full p-0.5 opacity-50 hover:opacity-100"
          onClick={onClose}
        >
          <X className="size-3" />
        </button>
        {isAnnotation ? (
          <button type="button" className="block w-full pr-3 text-left" onClick={onOpenSource}>
            {content}
          </button>
        ) : (
          <div className="pr-3">{content}</div>
        )}
        <span aria-hidden className={`-bottom-[7px] absolute right-6 size-3 rotate-45 border-r-2 border-b-2 ${tone}`} />
      </div>
    </motion.div>
  );
}

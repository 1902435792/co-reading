import { getAnnotationSourceTarget } from "@/components/side-chat/co-reading-backlink";
import { EMPTY_BOOK_NOTES, selectBookNotes } from "@/components/side-chat/co-reading-panel-state";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useReaderStore, useReaderStoreApi } from "@/pages/reader/components/reader-provider";
import { resolveCoReadingAgentModel } from "@/services/co-reading-agent-request";
import { iframeService } from "@/services/iframe-service";
import { useImmersiveStore } from "@/store/immersive-store";
import { SessionState } from "@/types/reading-session";
import type { BookNote } from "@/types/book";
import type { CoReadingSourceTarget } from "@/types/co-reading";
import { AnimatePresence, motion, useMotionValue, useReducedMotion } from "framer-motion";
import { ChevronRight, Minus, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  isJevConfigured,
  judgeAnnotationWithJev,
  judgePassageDifficultyWithJev,
  sampleEmotionWithJev,
  useJevSettings,
} from "@/services/jev-service";
import { getMemories } from "@/services/memory-service";
import { useLibraryStore } from "@/store/library-store";
import { useProviderStore } from "@/store/provider-store";
import { generateText } from "ai";
import { NOVA_IMAGE_BY_NAME, NOVA_LATE_NIGHT_IMAGE, NOVA_STATIC_AVATAR, pickNovaImage } from "./nova-assets";
import { type ChapterCard, buildChapterCardPrompt, parseChapterCardJson, shouldOfferChapterCard } from "./chapter-card";
import { ChapterCardDialog } from "./chapter-card-dialog";
import { type EmotionPoint, loadEmotionPoints, saveEmotionPoint } from "./emotion-curve";
import { EmotionCurveDialog } from "./emotion-curve-dialog";
import { loadChapterCards, saveChapterCard } from "./chapter-card-store";
import { NOVA_ASK_ACTIONS, NOVA_ASK_MENU, type NovaAskAction, buildNovaAskPrompt, cleanNovaAnswer } from "./nova-ask";
import { type NovaAskRequest, registerNovaAsker } from "./nova-bus";
import { setNovaCompanionMode, useNovaCompanionMode } from "./nova-companion-mode";
import { getNovaExtras, useNovaExtras } from "./nova-extras";
import { saveNoteWorth } from "./nova-ink";
import { NOVA_ONE_SHOT_MOODS, type NovaMood, buildNovaAnimation } from "./nova-lottie";
import { NovaLottiePlayer } from "./nova-lottie-player";
import {
  NOVA_SLEEP_AFTER_MS,
  NOVA_STUCK_AFTER_MS,
  deriveNovaMood,
  getAnnotationReaction,
  pickNovaLine,
  shortenNovaText,
} from "./nova-mood";
import {
  type CrossBookConcept,
  crossBookLine,
  findCrossBookLinks,
  loadCrossBookShown,
  rememberCrossBookShown,
} from "./nova-crossbook";
import { checkDiaryProposal, openCoReadingDiary } from "./nova-diary";
import { coReadingProfileAdvice } from "./nova-memory";
import { activeMsFromStats, formatActiveDuration, isLateNight, progressPercent } from "./nova-moments";

interface NovaBubble {
  id: number;
  kind: "annotation" | "info" | "error" | "answer" | "menu";
  /** 气泡顶部的小标题，不填时按 kind 生成。 */
  title?: string;
  /** 气泡底部的按钮（边注气泡不用）。 */
  actions?: NovaBubbleAction[];
  text: string;
  quote?: string;
  target?: CoReadingSourceTarget;
  /** 自动隐藏的毫秒数；0 表示一直显示，直到被替换。 */
  ttl: number;
}

interface NovaBubbleAction {
  label: string;
  onClick: () => void;
  primary?: boolean;
}

/** 读者主动问 Nova 时，最长等多久。 */
const NOVA_ASK_TIMEOUT_MS = 90_000;

interface NovaReaction {
  mood: NovaMood;
  until: number;
  /** Jev 挑出的具体表情；不填时按 mood 随机选。 */
  image?: string;
}

/** 跨书联想最多每 3 分钟提一次。 */
const NOVA_CROSSBOOK_GAP_MS = 3 * 60_000;
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
  const storeApi = useReaderStoreApi();
  const sectionIndex = useReaderStore((state) => state.progress?.sectionIndex ?? null);
  const sectionLabel = useReaderStore((state) => state.progress?.sectionLabel ?? "");
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
  const [dragOver, setDragOver] = useState(false);
  const [chapterCards, setChapterCards] = useState<ChapterCard[]>(() => loadChapterCards(bookId));
  const [openCard, setOpenCard] = useState<ChapterCard | null>(null);
  const [emotionPoints, setEmotionPoints] = useState<EmotionPoint[]>(() => loadEmotionPoints(bookId));
  const [showEmotion, setShowEmotion] = useState(false);
  const pageKey = useReaderStore((state) => state.progress?.location ?? null);
  const jevReady = isJevConfigured(useJevSettings());
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
      const id = bubbleIdRef.current;
      // 读者主动问出来的回答和菜单不被普通台词顶掉；新边注和出错照常替换。
      setBubble((current) =>
        current && (current.kind === "answer" || current.kind === "menu") && next.kind === "info"
          ? current
          : { ...next, id },
      );
      if (next.kind === "annotation") setLastAnnotation({ ...next, id });
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

  // 卡住探头（默认关闭）：同一页停留较久时问一句要不要帮忙；配置了 Jev 时先判断这页是不是真的难懂。
  const stuckAskedRef = useRef<string | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 每次时钟跳动检查一次
  useEffect(() => {
    if (!extras.stuckHint || collapsed || bubble || runtime.isProcessing) return;
    if (!isTabVisible || !pageVisible || !document.hasFocus()) return;
    const idle = now - lastActivityAt;
    if (idle < NOVA_STUCK_AFTER_MS || idle >= NOVA_SLEEP_AFTER_MS) return;
    const key = storeApi.getState().progress?.location;
    if (!key || stuckAskedRef.current === key) return;
    stuckAskedRef.current = key;
    const text = readVisibleText();
    if (text.length < 80) return;
    void judgePassageDifficultyWithJev(text).then((hard) => {
      if (hard === false || storeApi.getState().progress?.location !== key) return;
      react("thinking", 3_000);
      say({
        kind: "info",
        title: "Nova · 卡住了？",
        text: pickNovaLine("stuck", nextSeed()),
        ttl: 20_000,
        actions: [
          { label: "好呀，拆一下", primary: true, onClick: () => void runAsk(text, "unstuck") },
          { label: "不用", onClick: () => setBubble(null) },
        ],
      });
    });
  }, [now]);

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
    // 可选：Jev 一次请求同时给出更贴切的表情（「表情」开关）和墨点深浅用的价值分（墨点样式）。
    // 未开启或失败时保持上面的表情，墨点按想法长短估计。
    latestAnnotationIdRef.current = newest.id;
    const wantWorth = getNovaExtras().aiNoteStyle === "ink";
    for (const note of fresh.slice(-5)) {
      const isNewest = note.id === newest.id;
      if (!isNewest && !wantWorth) continue;
      void judgeAnnotationWithJev(note.text ?? "", note.note ?? "", { worth: wantWorth }).then((result) => {
        if (!result) return;
        if (result.worth !== null) saveNoteWorth(note.id, result.worth);
        if (!isNewest || !result.reaction || latestAnnotationIdRef.current !== newest.id) return;
        const image = NOVA_IMAGE_BY_NAME[result.reaction.image];
        setReaction({ mood: result.reaction.mood, until: Date.now() + 5_000, image });
      });
    }
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
    // 选中了正文再点 Nova：把选中的文字交给她。
    const selected = readSelectedText();
    if (selected) {
      openAskMenu(selected);
      return;
    }
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

  // ---------- 跨书联想 & 情绪曲线（翻页后停 3 秒再看这一页） ----------
  const conceptsRef = useRef<CrossBookConcept[] | null>(null);
  useEffect(() => {
    if (!extras.crossBook || conceptsRef.current) return;
    getMemories({ category: "concept", limit: 200 })
      .then((list) => {
        conceptsRef.current = list.map((item) => ({
          id: item.id,
          key: item.key,
          value: item.value,
          bookId: item.bookId,
        }));
      })
      .catch(() => {
        conceptsRef.current = [];
      });
  }, [extras.crossBook]);
  const crossBookAtRef = useRef(0);
  const emotionSampledRef = useRef(new Set<string>());
  const emotionBusyRef = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在翻页时触发
  useEffect(() => {
    if (!pageKey || !isTabVisible) return;
    const timer = window.setTimeout(() => {
      const state = storeApi.getState();
      if (state.progress?.location !== pageKey) return;
      const text = readVisibleText();
      if (text.length < 40) return;

      if (extras.crossBook && !bubble && !collapsed && Date.now() - crossBookAtRef.current > NOVA_CROSSBOOK_GAP_MS) {
        const books = useLibraryStore.getState().booksWithStatus.map((book) => ({
          id: book.id,
          title: book.title,
          status: book.status?.status,
          progress:
            book.status && book.status.progressTotal > 0
              ? book.status.progressCurrent / book.status.progressTotal
              : undefined,
        }));
        const [link] = findCrossBookLinks({
          text,
          currentBookId: bookId,
          currentTitle: bookTitle,
          books,
          concepts: conceptsRef.current ?? [],
          shown: loadCrossBookShown(bookId),
        });
        if (link) {
          crossBookAtRef.current = Date.now();
          rememberCrossBookShown(bookId, link.key);
          react("found", 3_000);
          const ok = { label: "知道啦", onClick: () => setBubble(null) };
          say({
            kind: "info",
            title: "Nova · 跨书联想",
            text: crossBookLine(link),
            ttl: 15_000,
            actions:
              link.kind === "concept"
                ? [
                    {
                      label: "让 Nova 连起来",
                      primary: true,
                      onClick: () =>
                        void runAsk(
                          `「${link.concept}」在《${link.title}》里：${link.value}\n\n这一页：${text.slice(0, 1_200)}`,
                          "connect",
                        ),
                    },
                    ok,
                  ]
                : [ok],
          });
        }
      }

      if (
        extras.emotionCurve &&
        jevReady &&
        !emotionBusyRef.current &&
        text.length >= 80 &&
        !emotionSampledRef.current.has(pageKey)
      ) {
        const info = state.progress?.pageinfo;
        if (!info || !(info.total > 0)) return;
        emotionSampledRef.current.add(pageKey);
        const fraction = info.current / info.total;
        const sectionLabel = state.progress?.sectionLabel || undefined;
        emotionBusyRef.current = true;
        void sampleEmotionWithJev(text)
          .then((result) => {
            if (result)
              setEmotionPoints(saveEmotionPoint(bookId, { at: Date.now(), fraction, sectionLabel, ...result }));
          })
          .finally(() => {
            emotionBusyRef.current = false;
          });
      }
    }, 3_000);
    return () => window.clearTimeout(timer);
  }, [pageKey]);

  // ---------- 读完一本书：提议写日记 ----------
  const finishedProposedRef = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在翻页时检查
  useEffect(() => {
    if (finishedProposedRef.current || !extras.diaryPrompt) return;
    const percent = progressPercent(storeApi.getState().progress?.pageinfo);
    if (percent === null || percent < 99) return;
    finishedProposedRef.current = true;
    void checkDiaryProposal({ bookId, trigger: "finished" }).then((proposal) => {
      if (!proposal) return;
      react("found", 4_000);
      say({
        kind: "info",
        title: "Nova · 读完啦",
        text: `${proposal.title}${proposal.description}`,
        ttl: 30_000,
        actions: [
          { label: "写日记", primary: true, onClick: () => openCoReadingDiary(bookId, bookTitle) },
          { label: "下次吧", onClick: () => setBubble(null) },
        ],
      });
    });
  }, [pageKey]);

  // ---------- Profile 体检：自动共读用了带 OneRing 的 Profile 时提醒一次 ----------
  const coReadingModelId = snapshot.settings.modelId;
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在共读模型变化时检查
  useEffect(() => {
    const modelId = coReadingModelId || useProviderStore.getState().selectedModel?.modelId;
    const advice = coReadingProfileAdvice(modelId);
    if (advice?.level !== "warn") return;
    const key = `deepreader:nova-profile-advice:${advice.profile}`;
    if (window.localStorage.getItem(key)) return;
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(key, String(Date.now()));
      say({
        kind: "info",
        title: "Nova · 小建议",
        text: advice.message,
        ttl: 30_000,
        actions: [{ label: "知道了", onClick: () => setBubble(null) }],
      });
    }, 12_000);
    return () => window.clearTimeout(timer);
  }, [coReadingModelId]);

  // ---------- 章末卡片 ----------
  const cardBusyRef = useRef(false);
  const cardAbortRef = useRef<AbortController | null>(null);
  // 关掉阅读页时中止还在生成的卡片。
  useEffect(() => () => cardAbortRef.current?.abort(), []);
  const currentActiveMs = () => {
    const stats = storeApi.getState().sessionStats;
    return stats
      ? activeMsFromStats(
          {
            totalActiveTime: stats.totalActiveTime,
            lastActivityTime: stats.lastActivityTime,
            isActive: stats.currentState === SessionState.ACTIVE,
          },
          Date.now(),
        )
      : null;
  };
  const readSectionText = async (index: number): Promise<string> => {
    const section = storeApi.getState().bookData?.bookDoc?.sections?.[index];
    if (section?.createDocument) {
      const doc = await section.createDocument();
      const text = doc.body?.textContent ?? doc.documentElement?.textContent ?? "";
      if (text.trim()) return text;
    }
    // 拿不到整章文档（例如 PDF）时，用共读已经记录下来的这一章文字兜底。
    return snapshotRef.current.blocks
      .filter((block) => block.sectionIndex === index)
      .map((block) => block.text)
      .join("\n");
  };
  const makeChapterCard = async (index: number, label: string) => {
    if (cardBusyRef.current) return;
    cardBusyRef.current = true;
    const title = "Nova · 章末卡片";
    setCollapsed(false);
    react("thinking", 120_000);
    say({ kind: "answer", title, text: `正在给「${label}」做卡片…`, ttl: 0 });
    const controller = new AbortController();
    cardAbortRef.current = controller;
    const timer = window.setTimeout(() => controller.abort(), 120_000);
    try {
      const text = await readSectionText(index);
      if (text.trim().length < 200) throw new Error("这一章文字太少，或者这种格式暂时拿不到整章文字");
      const { system, prompt } = buildChapterCardPrompt({ bookTitle, sectionLabel: label, text });
      const model = resolveCoReadingAgentModel(snapshotRef.current.settings);
      const result = await generateText({
        model,
        system,
        prompt,
        maxOutputTokens: 1_200,
        temperature: 0.4,
        maxRetries: 0,
        abortSignal: controller.signal,
      });
      const content = parseChapterCardJson(result.text);
      if (!content) throw new Error("卡片格式没解析出来，再试一次？");
      const card: ChapterCard = {
        ...content,
        id: `${bookId}:${index}:${Date.now()}`,
        bookId,
        bookTitle,
        sectionIndex: index,
        sectionLabel: label,
        createdAt: Date.now(),
      };
      setChapterCards(saveChapterCard(card));
      react("found", 4_000);
      const diary = extras.diaryPrompt ? await checkDiaryProposal({ bookId, trigger: "chapter-card" }) : null;
      say({
        kind: "answer",
        title,
        text: diary ? `「${label}」的卡片做好啦！${diary.title}${diary.description}` : `「${label}」的卡片做好啦！`,
        ttl: 0,
        actions: [
          { label: "打开卡片", primary: true, onClick: () => setOpenCard(card) },
          ...(diary ? [{ label: "写进日记", onClick: () => openCoReadingDiary(bookId, bookTitle) }] : []),
        ],
      });
      setOpenCard(card);
    } catch (error) {
      react("error", 3_000);
      say({
        kind: "error",
        text: controller.signal.aborted
          ? "卡片做太久了（超过 2 分钟），先放弃了，稍后再试试？"
          : `卡片没做成：${shortenNovaText(error instanceof Error ? error.message : String(error))}`,
        ttl: 10_000,
      });
    } finally {
      window.clearTimeout(timer);
      if (cardAbortRef.current === controller) cardAbortRef.current = null;
      cardBusyRef.current = false;
    }
  };
  // 翻到下一章时，如果上一章认真读过，问要不要做卡片（默认关闭）。
  const sectionEnterRef = useRef<{ index: number | null; label: string; activeMs: number | null; at: number }>({
    index: null,
    label: "",
    activeMs: null,
    at: Date.now(),
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在章节变化时判断
  useEffect(() => {
    const previous = sectionEnterRef.current;
    const activeNow = currentActiveMs();
    sectionEnterRef.current = { index: sectionIndex, label: sectionLabel ?? "", activeMs: activeNow, at: Date.now() };
    if (!extras.chapterCard || previous.index === null || previous.index === sectionIndex) return;
    const spent =
      activeNow !== null && previous.activeMs !== null ? activeNow - previous.activeMs : Date.now() - previous.at;
    if (!shouldOfferChapterCard({ fromIndex: previous.index, toIndex: sectionIndex, activeMsInSection: spent })) return;
    if (chapterCards.some((card) => card.sectionIndex === previous.index)) return;
    const index = previous.index;
    const label = previous.label || `第 ${index + 1} 部分`;
    react("found", 3_000);
    say({
      kind: "info",
      title: "Nova · 读完一章啦",
      text: `「${label}」读完了！要来张章末卡片吗？小结、3 个要点和 3 道小题。`,
      ttl: 20_000,
      actions: [
        { label: "来一张", primary: true, onClick: () => void makeChapterCard(index, label) },
        { label: "不用", onClick: () => setBubble(null) },
      ],
    });
  }, [sectionIndex]);

  // ---------- 问 Nova ----------
  const askAbortRef = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      const controller = askAbortRef.current;
      askAbortRef.current = null;
      controller?.abort();
    },
    [],
  );
  const runAsk = async (text: string, action: NovaAskAction) => {
    askAbortRef.current?.abort();
    const controller = new AbortController();
    askAbortRef.current = controller;
    const meta = NOVA_ASK_ACTIONS[action];
    const title = `Nova · ${meta.label}`;
    const quote = shortenNovaText(text, 70);
    setCollapsed(false);
    react("thinking", NOVA_ASK_TIMEOUT_MS);
    say({ kind: "answer", title, text: meta.thinking, quote, ttl: 0 });
    const timer = window.setTimeout(() => controller.abort(), NOVA_ASK_TIMEOUT_MS);
    try {
      const progress = storeApi.getState().progress;
      const { system, prompt } = buildNovaAskPrompt({
        action,
        text,
        bookTitle,
        sectionLabel: progress?.sectionLabel,
        percent: progressPercent(progress?.pageinfo),
        recap: snapshotRef.current.settings.rollingSummary,
        recentNotes: notes
          .filter(isAiAnnotation)
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, 3)
          .map((note) => note.note ?? ""),
      });
      const model = resolveCoReadingAgentModel(snapshotRef.current.settings);
      const result = await generateText({
        model,
        system,
        prompt,
        maxOutputTokens: 700,
        temperature: 0.7,
        maxRetries: 0,
        abortSignal: controller.signal,
      });
      if (askAbortRef.current !== controller) return;
      react("talking", 4_000);
      say({
        kind: "answer",
        title,
        text: cleanNovaAnswer(result.text) || "嗯…我一时没想好怎么说。",
        quote,
        ttl: 0,
        actions: [
          { label: "去侧栏接着聊", onClick: () => iframeService.sendAskAIRequest(text, meta.instruction, bookId) },
        ],
      });
    } catch (error) {
      if (askAbortRef.current !== controller) return;
      react("error", 3_000);
      say({
        kind: "error",
        text: controller.signal.aborted
          ? "想太久了…换个问法，或者稍后再试？"
          : `没问成功：${shortenNovaText(error instanceof Error ? error.message : String(error))}`,
        ttl: 10_000,
      });
    } finally {
      window.clearTimeout(timer);
      if (askAbortRef.current === controller) askAbortRef.current = null;
    }
  };
  const openAskMenu = (text: string) => {
    const clean = text.trim();
    if (!clean) return;
    setCollapsed(false);
    react("pet", 1_500);
    say({
      kind: "menu",
      title: "Nova · 想让我做什么？",
      text: "",
      quote: shortenNovaText(clean, 80),
      ttl: 0,
      actions: NOVA_ASK_MENU.map((action) => ({
        label: NOVA_ASK_ACTIONS[action].label,
        onClick: () => void runAsk(clean, action),
      })),
    });
  };
  const readSelectedText = (): string | null => {
    const contents = storeApi.getState().view?.renderer.getContents() ?? [];
    for (const content of contents) {
      const text = content.doc?.getSelection()?.toString().trim();
      if (text && text.length >= 2) return text;
    }
    return null;
  };
  const readVisibleText = (): string => {
    const state = storeApi.getState();
    const ranges = state.view?.renderer.getVisibleRanges?.() ?? [];
    const text = ranges
      .map((item) => item.range.toString())
      .join("\n")
      .trim();
    return text || (state.progress?.range?.toString().trim() ?? "");
  };
  // 其他地方（选中文字弹条）通过 nova-bus 把文字交给 Nova。
  const askHandlerRef = useRef<(request: NovaAskRequest) => void>(() => {});
  askHandlerRef.current = (request) => {
    if (request.action) void runAsk(request.text, request.action);
    else openAskMenu(request.text);
  };
  useEffect(() => registerNovaAsker(bookId, (request) => askHandlerRef.current(request)), [bookId]);
  const onDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("text/plain")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    if (!dragOver) setDragOver(true);
  };
  const onDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragOver(false);
  };
  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    openAskMenu(event.dataTransfer.getData("text/plain"));
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

        <div
          className={`relative rounded-full transition-transform ${dragOver ? "scale-110 ring-4 ring-amber-300" : ""}`}
          style={{ width: avatarSize, height: avatarSize }}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          {dragOver && (
            <div className="-top-7 pointer-events-none absolute right-0 z-20 whitespace-nowrap rounded-full bg-amber-400 px-2 py-0.5 font-medium text-[11px] text-amber-950 shadow">
              松手交给 Nova
            </div>
          )}
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
                title={
                  collapsed ? "展开 Nova · 右键更多" : "摸摸头 · 拖动可移动 · 右键更多\n选中文字后点我，或把文字拖给我"
                }
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
              <ContextMenuItem
                disabled={sectionIndex === null}
                onSelect={() => {
                  if (sectionIndex !== null)
                    void makeChapterCard(sectionIndex, sectionLabel || `第 ${sectionIndex + 1} 部分`);
                }}
              >
                为这一章做卡片
              </ContextMenuItem>
              {chapterCards.length > 0 && (
                <ContextMenuSub>
                  <ContextMenuSubTrigger>章末卡片（{chapterCards.length}）</ContextMenuSubTrigger>
                  <ContextMenuSubContent className="max-h-72 w-56 overflow-y-auto">
                    {[...chapterCards]
                      .sort((a, b) => a.sectionIndex - b.sectionIndex)
                      .map((card) => (
                        <ContextMenuItem key={card.id} onSelect={() => setOpenCard(card)}>
                          <span className="truncate">{card.sectionLabel}</span>
                        </ContextMenuItem>
                      ))}
                  </ContextMenuSubContent>
                </ContextMenuSub>
              )}
              <ContextMenuItem onSelect={() => openCoReadingDiary(bookId, bookTitle)}>写共读日记…</ContextMenuItem>
              <ContextMenuItem
                onSelect={() => {
                  setEmotionPoints(loadEmotionPoints(bookId));
                  setShowEmotion(true);
                }}
              >
                情绪曲线{emotionPoints.length > 0 ? `（${emotionPoints.length}）` : ""}
              </ContextMenuItem>
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
      <EmotionCurveDialog
        open={showEmotion}
        onOpenChange={setShowEmotion}
        bookTitle={bookTitle}
        points={emotionPoints}
        enabled={extras.emotionCurve}
        jevReady={jevReady}
      />
      <ChapterCardDialog
        card={openCard}
        onOpenChange={(open) => {
          if (!open) setOpenCard(null);
        }}
      />
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
        : bubble.kind === "answer"
          ? "border-sky-300 bg-sky-50 text-sky-950 dark:border-sky-800 dark:bg-sky-950/80 dark:text-sky-50"
          : "border-border bg-background text-foreground";
  const content = (
    <>
      <span className="mb-1 flex items-center gap-1 font-semibold text-[11px] opacity-70">
        {bubble.title ??
          `Nova${bubble.kind === "annotation" ? " · 新边注" : bubble.kind === "error" ? " · 出错了" : ""}`}
      </span>
      {bubble.quote && (
        <span className="mb-1.5 line-clamp-2 block border-black/15 border-l-2 pl-2 text-[11px] opacity-70 dark:border-white/25">
          {bubble.quote}
        </span>
      )}
      {bubble.text && (
        <span
          className={`block whitespace-pre-line leading-relaxed ${
            bubble.kind === "answer" ? "max-h-56 overflow-y-auto pr-1" : "line-clamp-6"
          }`}
        >
          {typed}
          {typed.length < bubble.text.length && <span className="ml-0.5 inline-block w-1 animate-pulse">▍</span>}
        </span>
      )}
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
      className={`relative mr-6 mb-2 max-w-[70vw] ${bubble.kind === "answer" || bubble.kind === "menu" ? "w-80" : "w-64"}`}
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
        {!isAnnotation && bubble.actions && bubble.actions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {bubble.actions.map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={action.onClick}
                className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                  action.primary
                    ? "border-transparent bg-foreground text-background hover:opacity-90"
                    : "border-black/15 bg-background/70 hover:bg-background dark:border-white/20"
                }`}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
        <span aria-hidden className={`-bottom-[7px] absolute right-6 size-3 rotate-45 border-r-2 border-b-2 ${tone}`} />
      </div>
    </motion.div>
  );
}

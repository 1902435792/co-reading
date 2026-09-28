import {
  CO_READING_BATCH_MAX_BLOCKS,
  buildCoReadingBatch,
  mergeTrackedCoReadingState,
  sanitizeCoReadingError,
  validateCoReadingItemResult,
} from "@/lib/co-reading-core";
import {
  contextAroundRange,
  extractVisibleCoReadingFocus,
  locateExactQuoteRange,
  resolveVisibleCoReadingRanges,
} from "@/lib/co-reading-dom";
import { resolveCoReadingModel } from "@/lib/co-reading-model";
import {
  CoReadingFocusCancelledError,
  identifyVisibleFocus,
  isClaimedFocusCommitted,
  isCoReadingFocusCancellation,
  isRangeTakeoverCancellation,
  shouldDrainCoReadingQueue,
  type VisibleQueuedFocus,
} from "@/lib/co-reading-run-state";
import {
  getCoReadingTrigger,
  groupByFocusKey,
  isJevPickNote,
  pauseMsFor,
  requiredDwellMs,
  shouldDispatchQueue,
} from "@/lib/co-reading-trigger";
import { createBookNote } from "@/services/book-note-service";
import { requestCoReadingItem } from "@/services/co-reading-ai-service";
import {
  evaluateCoReadingBatchWithJev,
  getJevSettings,
} from "@/services/jev-service";
import type { JevSentencePick } from "@/services/jev-rules";
import {
  claimCoReadingBlocks,
  completeCoReadingBatch,
  getCoReadingSnapshot,
  persistCoReadingFocus,
  releaseCoReadingFocus,
  upsertCoReadingBlocks,
} from "@/services/co-reading-service";
import { useProviderStore } from "@/store/provider-store";
import type {
  CoReadingBlock,
  CoReadingBlockUpsert,
  CoReadingNoteCreateData,
} from "@/types/co-reading";
import { useQueryClient } from "@tanstack/react-query";
import { md5 } from "js-md5";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  useReaderStore,
  useReaderStoreApi,
} from "../components/reader-provider";

const TICK_MS = 1_000;
const FLUSH_MS = 5_000;

interface TrackedBlock extends CoReadingBlockUpsert {
  status: "tracking" | "queued";
}

interface OrdinaryCoReadingRun {
  generation: number;
  controller: AbortController;
  /** 本批认领的正文块（可以跨多个页面焦点）。 */
  blockKeys: string[];
}

/** 失败后暂停自动发送多久（期间用户可以手动重试）。 */
const FAILURE_BACKOFF_MS = 30_000;

/** 失败后的退避期内不自动发送；过了退避期自动再试。 */
function isRunBlocked(
  runBlocked: { current: boolean },
  blockedAt: { current: number }
): boolean {
  return (
    runBlocked.current && performance.now() - blockedAt.current < FAILURE_BACKOFF_MS
  );
}

export function useCoReading(bookId: string, isVisible: boolean): void {
  const store = useReaderStoreApi();
  const view = useReaderStore((state) => state.view);
  const progress = useReaderStore((state) => state.progress);
  const snapshot = useReaderStore((state) => state.coReadingSnapshot);
  const selectedModel = useProviderStore((state) => state.selectedModel);
  const modelProviders = useProviderStore((state) => state.modelProviders);
  const coReadingModel = resolveCoReadingModel(
    snapshot?.settings,
    selectedModel,
    modelProviders
  );
  const queryClient = useQueryClient();
  const [samplingTick, setSamplingTick] = useState(0);

  const visibleBlocksRef = useRef<TrackedBlock[]>([]);
  const visibleFocusRef = useRef<VisibleQueuedFocus | null>(null);
  const trackedRef = useRef(new Map<string, TrackedBlock>());
  const observedAtRef = useRef(new Map<string, number>());
  const dirtyRef = useRef(new Set<string>());
  const processingRef = useRef(false);
  const runBlockedRef = useRef(false);
  const samplingGenerationRef = useRef(0);
  const workerGenerationRef = useRef(0);
  const activeRunRef = useRef<OrdinaryCoReadingRun | null>(null);
  const blockedFocusKeyRef = useRef<string | null>(null);
  const blockedAtRef = useRef(0);
  /** 最近一次翻页/滑动（可见段落集合变化）的时间，用来判断「停下来了」。 */
  const lastMoveAtRef = useRef(performance.now());
  const mountedRef = useRef(true);

  const refreshSnapshot = useCallback(async () => {
    const nextSnapshot = await getCoReadingSnapshot(bookId);
    if (mountedRef.current) store.getState().setCoReadingSnapshot(nextSnapshot);
    return nextSnapshot;
  }, [bookId, store]);

  const updateRuntime = useCallback(() => {
    const leading = visibleBlocksRef.current[0];
    const visibleFocus = visibleFocusRef.current;
    const visibleKeys = new Set(visibleFocus?.blockKeys ?? []);
    const allBlocks = store.getState().coReadingSnapshot?.blocks ?? [];
    const persistedVisible = allBlocks.filter((block) =>
      visibleKeys.has(block.blockKey)
    );
    const visibleTerminalBlockCount = persistedVisible.filter(
      (block) => block.status === "silent" || block.status === "annotated"
    ).length;
    const historicalQueuedBlockCount = allBlocks.filter(
      (block) => block.status === "queued" && !visibleKeys.has(block.blockKey)
    ).length;
    store.getState().setCoReadingRuntime({
      visibleBlockCount: visibleFocus?.blockKeys.length ?? 0,
      visibleQueuedBlockCount: persistedVisible.filter(
        (block) => block.status === "queued"
      ).length,
      visibleFailedBlockCount: persistedVisible.filter(
        (block) => block.status === "failed"
      ).length,
      leadingBlockKey: leading?.blockKey ?? visibleFocus?.blockKeys[0] ?? null,
      leadingBlockDwellMs: leading?.dwellMs ?? 0,
      focusKey: visibleFocus?.focusKey ?? null,
      historicalQueuedBlockCount,
      visibleTerminalBlockCount,
      runBlocked: isRunBlocked(runBlockedRef, blockedAtRef),
    });
  }, [store]);

  /** 整本书里所有排队中的段落，按「读完」的先后顺序。翻走/划走不会丢。 */
  const getQueuedBlocks = useCallback(
    (nextSnapshot = store.getState().coReadingSnapshot): CoReadingBlock[] => {
      if (!nextSnapshot) return [];
      return nextSnapshot.blocks
        .filter((block) => block.status === "queued")
        .map((block, index) => ({ block, index }))
        .sort(
          (a, b) =>
            (a.block.unlockedAt ?? 0) - (b.block.unlockedAt ?? 0) ||
            a.index - b.index
        )
        .map(({ block }) => block);
    },
    [store]
  );

  /** 按焦点分组释放（后端要求整焦点释放；释放不了的 5 分钟后会自动回到队列）。 */
  const releaseBlocks = useCallback(
    async (blocks: readonly CoReadingBlock[]) => {
      const groups = groupByFocusKey(
        blocks.map((block) => ({
          blockKey: block.blockKey,
          focusKey: block.focusKey ?? block.blockKey,
        }))
      );
      for (const group of groups) {
        try {
          await releaseCoReadingFocus({
            bookId,
            blockKeys: group.map((block) => block.blockKey),
          });
        } catch {
          // 部分焦点无法释放：交给快照的超时恢复。
        }
      }
    },
    [bookId]
  );

  /** 只在共读被暂停/关闭时取消；翻页、滑动不再打断正在进行的请求。 */
  const cancelActiveRun = useCallback((reason = "共读已暂停") => {
    const active = activeRunRef.current;
    if (!active || active.controller.signal.aborted) return;
    active.controller.abort(new CoReadingFocusCancelledError(reason));
  }, []);

  const flush = useCallback(async () => {
    const blocks = Array.from(dirtyRef.current)
      .map((blockKey) => trackedRef.current.get(blockKey))
      .filter((block): block is TrackedBlock => Boolean(block));
    if (blocks.length === 0) return;

    dirtyRef.current.clear();
    try {
      const saved = await upsertCoReadingBlocks(blocks);
      for (const block of saved) {
        if (block.status !== "tracking" && block.status !== "queued") continue;
        const tracked = trackedRef.current.get(block.blockKey);
        if (!tracked) continue;
        Object.assign(tracked, mergeTrackedCoReadingState(tracked, block));
      }
      updateRuntime();
      const nextSnapshot = await getCoReadingSnapshot(bookId);
      if (mountedRef.current)
        store.getState().setCoReadingSnapshot(nextSnapshot);
    } catch (error) {
      for (const block of blocks) dirtyRef.current.add(block.blockKey);
      store.getState().setCoReadingRuntime({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, [bookId, store, updateRuntime]);

  /** 在已解锁原文里精确定位引文，得到 CFI 和上下文（未渲染的章节会临时载入）。 */
  const resolveQuoteAnchor = useCallback(
    async (block: CoReadingBlock, quote: string) => {
      if (!view) throw new Error("阅读视图尚未就绪");
      const resolved = view.resolveCFI(block.cfi);
      const content = view.renderer
        .getContents()
        .find((item) => item.index === resolved.index);
      const section = view.book.sections?.[resolved.index];
      const doc = content?.doc ?? (await section?.createDocument?.());
      if (!doc) throw new Error("无法载入对应的已解锁章节");
      const quoteRange = locateExactQuoteRange(resolved.anchor(doc), quote);
      if (!quoteRange || quoteRange.toString() !== quote) {
        throw new Error("无法在已解锁原文中精确定位引文");
      }
      return {
        cfi: view.getCFI(resolved.index, quoteRange),
        context: contextAroundRange(quoteRange),
      };
    },
    [view]
  );

  const prepareAiAnnotation = useCallback(
    async (
      block: CoReadingBlock,
      quote: string,
      comment: string
    ): Promise<CoReadingNoteCreateData> => {
      const anchor = await resolveQuoteAnchor(block, quote);
      const id = md5(
        `${bookId}:${block.focusKey ?? block.blockKey}:${
          block.blockKey
        }:${quote}`
      );
      return {
        id,
        blockKey: block.blockKey,
        type: "annotation",
        cfi: anchor.cfi,
        text: quote,
        style: "underline",
        color: "blue",
        note: comment,
        context: anchor.context,
      };
    },
    [bookId, resolveQuoteAnchor]
  );

  const failClaimedBlocks = useCallback(
    async (claimed: CoReadingBlock[], error: unknown) => {
      const message = sanitizeCoReadingError(error);
      let lastError: unknown = error;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          await completeCoReadingBatch({
            bookId,
            blockKeys: claimed.map((block) => block.blockKey),
            status: "failed",
            error: message,
          });
          store.getState().setCoReadingRuntime({ error: message });
          return;
        } catch (cleanupError) {
          lastError = cleanupError;
          if (attempt === 0) {
            await new Promise((resolve) => window.setTimeout(resolve, 250));
          }
        }
      }
      throw lastError;
    },
    [bookId, store]
  );

  /** 把 JEV 选中的句子划上紫色波浪线（和 Nova 边注互相独立，可以重叠）。失败不影响共读。 */
  const addJevWavyNotes = useCallback(
    async (picks: readonly JevSentencePick[], blocks: readonly CoReadingBlock[]) => {
      if (picks.length === 0) return;
      const existing = store.getState().config?.booknotes ?? [];
      const created = [];
      for (const pick of picks) {
        const block = blocks.find((item) => item.blockKey === pick.blockKey);
        if (!block) continue;
        if (
          existing.some(
            (note) =>
              isJevPickNote(note) && !note.deletedAt && note.text === pick.text
          )
        )
          continue;
        try {
          const anchor = await resolveQuoteAnchor(block, pick.text);
          created.push(
            await createBookNote({
              bookId,
              type: "annotation",
              cfi: anchor.cfi,
              style: "squiggly",
              color: "violet",
              author: "ai",
              text: pick.text,
              note: `JEV 觉得这句值得回味（把握 ${Math.round(
                pick.confidence * 100
              )}%）`,
              context: anchor.context,
            })
          );
        } catch {
          // 定位不到就不划。
        }
      }
      if (created.length === 0) return;
      const updatedConfig = store
        .getState()
        .updateBooknotes([
          ...(store.getState().config?.booknotes ?? []),
          ...created,
        ]);
      for (const note of created) {
        try {
          view?.addAnnotation(note);
        } catch {
          // 所在章节没渲染时，下次渲染会自动画上。
        }
      }
      if (updatedConfig) await store.getState().saveConfig(updatedConfig);
    },
    [bookId, resolveQuoteAnchor, store, view]
  );

  const drainQueue = useCallback(async () => {
    const currentSnapshot = store.getState().coReadingSnapshot;
    if (!currentSnapshot) return;
    const queued = getQueuedBlocks(currentSnapshot);
    if (
      !shouldDrainCoReadingQueue({
        status: currentSnapshot.settings.status,
        queuedCount: queued.length,
        modelReady: Boolean(coReadingModel),
        runBlocked: isRunBlocked(runBlockedRef, blockedAtRef),
        processing: processingRef.current,
      })
    )
      return;
    if (runBlockedRef.current) {
      // 退避时间已过，自动再试一次。
      runBlockedRef.current = false;
      blockedFocusKeyRef.current = null;
    }

    const recent = currentSnapshot.blocks
      .filter(
        (block) => block.status === "silent" || block.status === "annotated"
      )
      .sort((a, b) => (b.processedAt ?? 0) - (a.processedAt ?? 0));
    const aiNotes = (store.getState().config?.booknotes ?? [])
      .filter(
        (note) =>
          note.type === "annotation" &&
          note.author === "ai" &&
          !isJevPickNote(note)
      )
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((note) => `“${note.text ?? ""}” ${note.note}`);
    // 队列模式：按阅读顺序取一批（最多 12 段 / 字数预算内），可以跨越多个页面。
    const batch = buildCoReadingBatch({
      queued,
      recent,
      rollingSummary: currentSnapshot.settings.rollingSummary,
      annotations: aiNotes,
    });
    // 单独一段就超出预算时也发出去（请求会报「太长已跳过」并标记失败），避免它永远卡住队列。
    if (batch.newBlocks.length === 0) batch.newBlocks = queued.slice(0, 1);
    if (batch.newBlocks.length === 0) return;
    const blockKeys = batch.newBlocks.map((block) => block.blockKey);

    const generation = ++workerGenerationRef.current;
    const controller = new AbortController();
    activeRunRef.current = { generation, controller, blockKeys };
    processingRef.current = true;

    const ownsRun = () => {
      const active = activeRunRef.current;
      return (
        mountedRef.current &&
        active?.generation === generation &&
        active.controller === controller
      );
    };
    const assertRunning = () => {
      if (!ownsRun() || controller.signal.aborted) {
        throw new CoReadingFocusCancelledError();
      }
    };

    store.getState().setCoReadingRuntime({
      isProcessing: true,
      processingStartedAt: Date.now(),
      runBlocked: false,
      error: null,
    });
    let claimed: CoReadingBlock[] = [];
    const persistedKeys = new Set<string>();
    const unpersisted = () =>
      claimed.filter((block) => !persistedKeys.has(block.blockKey));
    try {
      try {
        claimed = await claimCoReadingBlocks(bookId, blockKeys);
      } catch {
        // 快照过期（有段落已被处理或不再排队）：刷新后下一轮再取。
        await refreshSnapshot();
        return;
      }
      if (claimed.length === 0) return;
      assertRunning();
      store.getState().setCoReadingRuntime({
        processingBlockCount: claimed.length,
      });

      try {
        // JEV：「值不值得批注」（智能判断开启或 JEV 预筛开启时）和「波浪线选句」合在一个请求里。
        // 未配置 JEV 或请求失败时 gate 为 null、picks 为空，照常请求 Nova。
        const trigger = getCoReadingTrigger();
        const verdict = await evaluateCoReadingBatchWithJev(
          claimed,
          {
            gate: trigger.smart || getJevSettings().prefilter,
            wavy: trigger.wavy,
          },
          controller.signal
        );
        assertRunning();
        let validated: {
          summary?: string;
          annotations: ReturnType<
            typeof validateCoReadingItemResult
          >["annotations"];
        };
        if (verdict.gate?.skip) {
          validated = { annotations: [] };
        } else {
          const decision = await requestCoReadingItem(
            { ...batch, newBlocks: claimed },
            currentSnapshot.settings,
            controller.signal
          );
          assertRunning();
          validated = validateCoReadingItemResult(decision, claimed, {
            multiFocus: true,
            dropInvalid: true,
          });
        }
        const preparedNotes = (
          await Promise.all(
            validated.annotations.map((annotation) =>
              prepareAiAnnotation(
                annotation.block,
                annotation.quote,
                annotation.comment
              ).catch(() => null)
            )
          )
        ).filter((note): note is CoReadingNoteCreateData => Boolean(note));
        assertRunning();

        // 后端一次只能持久化同一个页面焦点：按焦点分组依次写入，摘要跟最后一组一起写。
        const groups = groupByFocusKey(
          claimed.map((block) => ({
            block,
            focusKey: block.focusKey ?? block.blockKey,
          }))
        );
        const savedNotes: Awaited<
          ReturnType<typeof persistCoReadingFocus>
        >["notes"] = [];
        for (const [index, group] of groups.entries()) {
          const keys = group.map((item) => item.block.blockKey);
          const keySet = new Set(keys);
          const persisted = await persistCoReadingFocus({
            bookId,
            blockKeys: keys,
            notes: preparedNotes.filter((note) => keySet.has(note.blockKey)),
            rollingSummary:
              index === groups.length - 1 ? validated.summary : undefined,
          });
          for (const key of keys) persistedKeys.add(key);
          savedNotes.push(...persisted.notes);
        }

        if (savedNotes.length > 0) {
          try {
            const existingNotes = store.getState().config?.booknotes ?? [];
            const persistedIds = new Set(savedNotes.map((note) => note.id));
            const updatedConfig = store
              .getState()
              .updateBooknotes([
                ...existingNotes.filter((note) => !persistedIds.has(note.id)),
                ...savedNotes,
              ]);
            for (const note of savedNotes) {
              try {
                view?.addAnnotation(note);
              } catch {
                // 所在章节没渲染时，下次渲染会自动画上。
              }
            }
            if (updatedConfig) await store.getState().saveConfig(updatedConfig);
          } catch (error) {
            store.getState().setCoReadingRuntime({
              error: `书评已保存，但阅读视图刷新失败：${sanitizeCoReadingError(
                error
              )}`,
            });
          }
        }
        try {
          await addJevWavyNotes(verdict.picks, claimed);
        } catch {
          // 波浪线只是锦上添花。
        }
        if (savedNotes.length > 0 || verdict.picks.length > 0) {
          await queryClient.invalidateQueries({
            queryKey: ["annotations", bookId],
          });
        }
      } catch (error) {
        const cancelled =
          isCoReadingFocusCancellation(error) ||
          (controller.signal.aborted &&
            isCoReadingFocusCancellation(controller.signal.reason));
        if (cancelled) {
          await releaseBlocks(unpersisted());
          await refreshSnapshot();
          return;
        }
        if (isRangeTakeoverCancellation(error)) {
          await refreshSnapshot();
          store.getState().setCoReadingRuntime({
            runBlocked: false,
            error: error instanceof Error ? error.message : String(error),
          });
          return;
        }

        const message = sanitizeCoReadingError(error);
        const remaining = unpersisted();
        let committedAfterResponseLoss = remaining.length === 0;
        try {
          const latest = await refreshSnapshot();
          committedAfterResponseLoss ||= isClaimedFocusCommitted(
            remaining.map((block) => block.blockKey),
            latest.blocks
          );
        } catch {
          // If the verification read also fails, preserve the normal failure path.
        }

        if (committedAfterResponseLoss) {
          store.getState().setCoReadingRuntime({
            error: "这批已保存，但客户端未收到持久化响应；已避免重复写入",
          });
        } else {
          let finalMessage = message;
          try {
            await failClaimedBlocks(remaining, error);
          } catch (cleanupError) {
            finalMessage = `${message}；失败状态写入失败：${sanitizeCoReadingError(
              cleanupError
            )}`;
          }
          runBlockedRef.current = true;
          blockedAtRef.current = performance.now();
          blockedFocusKeyRef.current = visibleFocusRef.current?.focusKey ?? null;
          store.getState().setCoReadingRuntime({
            runBlocked: true,
            error: finalMessage,
          });
        }
      }
    } catch (error) {
      const cancelled =
        isCoReadingFocusCancellation(error) ||
        (controller.signal.aborted &&
          isCoReadingFocusCancellation(controller.signal.reason));
      if (cancelled && claimed.length > 0) {
        await releaseBlocks(unpersisted());
        await refreshSnapshot();
      } else if (!cancelled) {
        store.getState().setCoReadingRuntime({
          error: sanitizeCoReadingError(error),
        });
      }
    } finally {
      if (ownsRun()) {
        activeRunRef.current = null;
        processingRef.current = false;
        store.getState().setCoReadingRuntime({
          isProcessing: false,
          processingBlockCount: 0,
          processingStartedAt: null,
          runBlocked: isRunBlocked(runBlockedRef, blockedAtRef),
        });
        try {
          const latest = await refreshSnapshot();
          updateRuntime();
          // 队列里还有已读完的段落：马上接着发下一批（它们已经等过了）。
          if (
            shouldDrainCoReadingQueue({
              status: latest.settings.status,
              queuedCount: getQueuedBlocks(latest).length,
              modelReady: Boolean(coReadingModel),
              runBlocked: isRunBlocked(runBlockedRef, blockedAtRef),
              processing: processingRef.current,
            })
          ) {
            window.setTimeout(() => void drainQueue(), 0);
          }
        } catch (error) {
          store.getState().setCoReadingRuntime({
            error: sanitizeCoReadingError(error),
          });
        }
      }
    }
  }, [
    addJevWavyNotes,
    bookId,
    coReadingModel,
    failClaimedBlocks,
    getQueuedBlocks,
    prepareAiAnnotation,
    queryClient,
    refreshSnapshot,
    releaseBlocks,
    store,
    updateRuntime,
    view,
  ]);

  useEffect(() => {
    mountedRef.current = true;
    refreshSnapshot().catch((error) => {
      store.getState().setCoReadingRuntime({
        error: error instanceof Error ? error.message : String(error),
      });
    });
    return () => {
      mountedRef.current = false;
      const active = activeRunRef.current;
      if (active && !active.controller.signal.aborted) {
        active.controller.abort(
          new CoReadingFocusCancelledError("阅读器已关闭")
        );
      }
    };
  }, [refreshSnapshot, store]);

  useEffect(() => {
    const handleRetry = (event: Event) => {
      const detail = (event as CustomEvent<{ bookId?: string }>).detail;
      if (detail?.bookId !== bookId) return;
      runBlockedRef.current = false;
      blockedFocusKeyRef.current = null;
      samplingGenerationRef.current += 1;
      store.getState().setCoReadingRuntime({ runBlocked: false, error: null });
      // Failed blocks become queued in SQLite before this event. Resample the actual current
      // page first; off-screen retried history remains queued until the user revisits it.
      setSamplingTick((value) => value + 1);
      void refreshSnapshot().catch((error) => {
        runBlockedRef.current = true;
        blockedFocusKeyRef.current = visibleFocusRef.current?.focusKey ?? null;
        store.getState().setCoReadingRuntime({
          runBlocked: true,
          error: sanitizeCoReadingError(error),
        });
      });
    };
    window.addEventListener("deepreader:co-reading-retry", handleRetry);
    return () =>
      window.removeEventListener("deepreader:co-reading-retry", handleRetry);
  }, [bookId, refreshSnapshot, store]);

  useEffect(() => {
    if (
      !view ||
      !progress ||
      snapshot?.settings.status !== "active" ||
      !isVisible
    ) {
      visibleFocusRef.current = null;
      if (snapshot?.settings.status !== "active") cancelActiveRun();
      visibleBlocksRef.current = [];
      observedAtRef.current.clear();
      updateRuntime();
      return;
    }

    let cancelled = false;
    const generation = ++samplingGenerationRef.current;
    const visibleRanges = resolveVisibleCoReadingRanges(view, progress);
    if (visibleRanges.length === 0) {
      visibleFocusRef.current = null;
      visibleBlocksRef.current = [];
      store.getState().setCoReadingRuntime({
        error: "当前可见页尚未稳定，正在等待阅读视图完成布局",
      });
      updateRuntime();
      return;
    }
    const extracted = extractVisibleCoReadingFocus(
      bookId,
      view,
      visibleRanges,
      progress.sectionLabel
    );
    const extractedFocus = identifyVisibleFocus(extracted);
    const previousKeys = visibleFocusRef.current?.blockKeys ?? [];
    const nextKeys = extractedFocus?.blockKeys ?? [];
    if (
      previousKeys.length !== nextKeys.length ||
      previousKeys.some((key, index) => key !== nextKeys[index])
    ) {
      // 可见段落变了 = 刚翻页/滑动过。失败退避只按时间解除，避免滑动时反复撞失败。
      lastMoveAtRef.current = performance.now();
    }
    visibleFocusRef.current = extractedFocus;

    upsertCoReadingBlocks(extracted)
      .then((saved) => {
        if (cancelled || generation !== samplingGenerationRef.current) return;
        const visible: TrackedBlock[] = [];
        for (const block of saved) {
          if (block.status !== "tracking" && block.status !== "queued")
            continue;
          const existing = trackedRef.current.get(block.blockKey);
          const tracked: TrackedBlock = {
            id: block.id,
            bookId: block.bookId,
            blockKey: block.blockKey,
            focusKey: block.focusKey ?? block.blockKey,
            sectionIndex: block.sectionIndex,
            sectionLabel: block.sectionLabel,
            cfi: block.cfi,
            text: block.text,
            textHash: block.textHash,
            dwellMs: Math.max(existing?.dwellMs ?? 0, block.dwellMs),
            status: existing?.status === "queued" ? "queued" : block.status,
            unlockedAt: existing?.unlockedAt ?? block.unlockedAt,
          };
          trackedRef.current.set(block.blockKey, tracked);
          visible.push(tracked);
        }
        visibleBlocksRef.current = visible;
        const now = performance.now();
        const visibleKeys = new Set(visible.map((block) => block.blockKey));
        for (const key of observedAtRef.current.keys()) {
          if (!visibleKeys.has(key)) observedAtRef.current.delete(key);
        }
        for (const block of visible) {
          if (!observedAtRef.current.has(block.blockKey))
            observedAtRef.current.set(block.blockKey, now);
        }
        updateRuntime();
      })
      .catch((error) => {
        store.getState().setCoReadingRuntime({
          error: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      cancelled = true;
      const now = performance.now();
      if (isVisible && document.visibilityState === "visible") {
        for (const block of visibleBlocksRef.current) {
          if (block.status !== "tracking") continue;
          const observedAt = observedAtRef.current.get(block.blockKey) ?? now;
          block.dwellMs += Math.round(
            Math.max(0, Math.min(now - observedAt, TICK_MS * 1.5))
          );
          observedAtRef.current.set(block.blockKey, now);
          dirtyRef.current.add(block.blockKey);
        }
        void flush();
      }
      visibleBlocksRef.current = [];
      updateRuntime();
    };
  }, [
    bookId,
    cancelActiveRun,
    flush,
    isVisible,
    progress,
    snapshot?.settings.status,
    samplingTick,
    store,
    updateRuntime,
    view,
  ]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const currentSnapshot = store.getState().coReadingSnapshot;
      const now = performance.now();
      if (
        currentSnapshot?.settings.status !== "active" ||
        !isVisible ||
        document.visibilityState !== "visible"
      ) {
        for (const block of visibleBlocksRef.current)
          observedAtRef.current.set(block.blockKey, now);
        return;
      }

      // 每个段落各自计时：停留够「读完它需要的时间」就进入队列。
      // 智能判断开：按字数估算（1.5–8 秒），快速划过的段落不算读过；关：固定 N 秒。
      const trigger = getCoReadingTrigger();
      const dwellSeconds = trigger.seconds;
      const unlockedAt = Date.now();
      let unlocked = false;
      let stillReading = false;
      for (const block of visibleBlocksRef.current) {
        if (block.status !== "tracking") continue;
        const observedAt = observedAtRef.current.get(block.blockKey) ?? now;
        const elapsed = Math.max(0, Math.min(now - observedAt, TICK_MS * 1.5));
        observedAtRef.current.set(block.blockKey, now);
        block.dwellMs += Math.round(elapsed);
        dirtyRef.current.add(block.blockKey);
        if (
          block.dwellMs >=
          requiredDwellMs(block.text, trigger.smart, dwellSeconds)
        ) {
          block.status = "queued";
          block.unlockedAt ??= unlockedAt;
          unlocked = true;
        } else {
          stillReading = true;
        }
      }
      updateRuntime();

      // 队列 = 数据库里排队的 + 本地刚解锁还没写入的。
      const persistedStatus = new Map(
        currentSnapshot.blocks.map((block) => [block.blockKey, block.status])
      );
      const pending = new Map<
        string,
        { text: string; unlockedAt: number | null }
      >();
      for (const block of getQueuedBlocks(currentSnapshot))
        pending.set(block.blockKey, block);
      for (const block of trackedRef.current.values()) {
        const status = persistedStatus.get(block.blockKey);
        if (
          block.status === "queued" &&
          (status === undefined || status === "tracking")
        )
          pending.set(block.blockKey, block);
      }
      let queuedChars = 0;
      let oldest = Number.POSITIVE_INFINITY;
      for (const block of pending.values()) {
        queuedChars += block.text.length;
        if (block.unlockedAt) oldest = Math.min(oldest, block.unlockedAt);
      }
      const dispatch =
        !processingRef.current &&
        shouldDispatchQueue({
          queuedCount: pending.size,
          queuedChars,
          maxBlocks: CO_READING_BATCH_MAX_BLOCKS,
          // 屏幕上还有没读完的段落时，不算「停下来了」。
          idleMs: stillReading ? 0 : now - lastMoveAtRef.current,
          pauseMs: pauseMsFor(dwellSeconds),
          oldestWaitMs: Number.isFinite(oldest) ? unlockedAt - oldest : 0,
        });
      if (unlocked || dispatch) {
        void flush()
          .then(() => (dispatch ? drainQueue() : undefined))
          .catch((error) => {
            runBlockedRef.current = true;
            blockedAtRef.current = performance.now();
            store.getState().setCoReadingRuntime({
              runBlocked: true,
              error: sanitizeCoReadingError(error),
            });
          });
      }
    }, TICK_MS);
    return () => window.clearInterval(interval);
  }, [drainQueue, flush, getQueuedBlocks, isVisible, store, updateRuntime]);

  useEffect(() => {
    const interval = window.setInterval(() => void flush(), FLUSH_MS);
    return () => {
      window.clearInterval(interval);
      void flush();
    };
  }, [flush]);

  useEffect(() => {
    if (!view || snapshot?.settings.status !== "active" || !isVisible) return;
    let timer: number | undefined;
    // 节流而不是防抖：连续滑动时也每 300ms 采样一次，快速划过的段落不会被误算停留时间。
    const resample = () => {
      if (timer) return;
      timer = window.setTimeout(() => {
        timer = undefined;
        setSamplingTick((value) => value + 1);
      }, 300);
    };
    view.addEventListener("load", resample);
    view.addEventListener("relocate", resample);
    window.addEventListener("foliate-layout-stable", resample);
    resample();
    return () => {
      if (timer) window.clearTimeout(timer);
      view.removeEventListener("load", resample);
      view.removeEventListener("relocate", resample);
      window.removeEventListener("foliate-layout-stable", resample);
    };
  }, [isVisible, snapshot?.settings.status, store, view]);
}

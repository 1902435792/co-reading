import {
  type AnnotationChange,
  isEditableTarget,
  pushRedo,
  pushUndo,
  recordAnnotationChange,
  takeRedo,
  takeUndo,
  undoKeyAction,
} from "@/lib/annotation-history";
import { REVIEW_MODE_LABEL } from "@/lib/comment-review";
import { createBookNote, deleteBookNote, updateBookNote } from "@/services/book-note-service";
import { generateCommentReview } from "@/services/comment-review-service";
import { iframeService } from "@/services/iframe-service";
import { useAppSettingsStore } from "@/store/app-settings-store";
import { useLayoutStore } from "@/store/layout-store";
import type { BookNote, HighlightColor, HighlightStyle } from "@/types/book";
import { type Position, type TextSelection, getPopupPosition, getPosition } from "@/utils/sel";
import { useQueryClient } from "@tanstack/react-query";
import * as CFI from "foliate-js/epubcfi.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useReaderStore, useReaderStoreApi } from "../components/reader-provider";

function getContextByRange(range: Range, win = 30) {
  const container = range.commonAncestorContainer;
  const el =
    (container.nodeType === Node.ELEMENT_NODE ? (container as Element) : (container.parentElement as Element)).closest(
      "p,li,div,section,article,blockquote,td",
    ) || document.body;

  const blockText = el.textContent || "";
  const highlight = range.toString();
  const i = blockText.indexOf(highlight);
  if (i < 0) return { before: "", highlight, after: "" };

  const s = Math.max(0, i - win);
  const e = Math.min(blockText.length, i + highlight.length + win);
  const squash = (s: string) => s.replace(/\s+/g, " ");
  return {
    before: squash(blockText.slice(s, i)),
    highlight,
    after: squash(blockText.slice(i + highlight.length, e)),
  };
}

interface UseAnnotatorProps {
  bookId: string;
}

export interface CommentDraft {
  cfi: string;
  text: string;
  context: { before: string; after: string };
  note: string;
  editing: boolean;
  position: Position;
  width: number;
}

export const useAnnotator = ({ bookId }: UseAnnotatorProps) => {
  const { settings } = useAppSettingsStore();
  const config = useReaderStore((state) => state.config)!;
  const progress = useReaderStore((state) => state.progress)!;
  const view = useReaderStore((state) => state.view);
  const store = useReaderStoreApi();
  const queryClient = useQueryClient();
  const globalViewSettings = settings.globalViewSettings;

  // 状态管理
  const [selection, setSelection] = useState<TextSelection | null>(null);
  const [showAnnotPopup, setShowAnnotPopup] = useState(false);
  const [showAskAIPopup, setShowAskAIPopup] = useState(false);
  const [trianglePosition, setTrianglePosition] = useState<Position>();
  const [annotPopupPosition, setAnnotPopupPosition] = useState<Position>();
  const [askAIPopupPosition, setAskAIPopupPosition] = useState<Position>();
  const [highlightOptionsVisible, setHighlightOptionsVisible] = useState(false);
  const [commentDraft, setCommentDraft] = useState<CommentDraft | null>(null);

  const [selectedStyle, setSelectedStyle] = useState<HighlightStyle>(settings.globalReadSettings.highlightStyle);
  const [selectedColor, setSelectedColor] = useState<HighlightColor>(
    settings.globalReadSettings.highlightStyles[selectedStyle],
  );

  const popupPadding = 10;
  const annotPopupWidth = Math.min(globalViewSettings?.vertical ? 320 : 340, window.innerWidth - 2 * popupPadding);
  const annotPopupHeight = 36;

  // Popup 相关函数
  const handleDismissPopup = useCallback(() => {
    setSelection(null);
    setShowAnnotPopup(false);
    setShowAskAIPopup(false);
  }, []);

  const handleDismissPopupAndSelection = useCallback(() => {
    handleDismissPopup();
    view?.deselect();
  }, [handleDismissPopup, view]);

  // 业务逻辑函数
  const handleCopy = useCallback(() => {
    if (!selection || !selection.text) return;
    if (selection) navigator.clipboard?.writeText(selection.text);
    toast.success("Copy success!");
    handleDismissPopupAndSelection();
  }, [selection, handleDismissPopupAndSelection]);

  const handleHighlight = useCallback(
    async (update = false) => {
      if (!selection || !selection.text) return;
      setHighlightOptionsVisible(true);
      const { booknotes: annotations = [] } = config;
      const cfi = view?.getCFI(selection.index, selection.range);
      if (!cfi) return;

      const style = settings.globalReadSettings.highlightStyle;
      const color = settings.globalReadSettings.highlightStyles[style];

      const existingAnnotation = annotations.find(
        (annotation) => annotation.cfi === cfi && annotation.type === "annotation" && !annotation.deletedAt,
      );

      try {
        if (existingAnnotation) {
          if (update) {
            const updatedAnnotation = await updateBookNote(existingAnnotation.id, {
              style,
              color,
              text: selection.text,
              note: existingAnnotation.note,
            });

            const updatedAnnotations = annotations.map((ann) =>
              ann.id === existingAnnotation.id ? updatedAnnotation : ann,
            );
            const updatedConfig = store.getState().updateBooknotes(updatedAnnotations);
            view?.addAnnotation(updatedAnnotation, true);
            view?.addAnnotation(updatedAnnotation);

            if (updatedConfig) {
              await store.getState().saveConfig(updatedConfig);
            }
            queryClient.invalidateQueries({ queryKey: ["annotations", bookId] });
          } else {
            await deleteBookNote(existingAnnotation.id);
            recordAnnotationChange(bookId, { kind: "delete", note: existingAnnotation });
            const updatedAnnotations = annotations.filter((ann) => ann.id !== existingAnnotation.id);
            const updatedConfig = store.getState().updateBooknotes(updatedAnnotations);

            view?.addAnnotation(existingAnnotation, true);

            setShowAnnotPopup(false);

            if (updatedConfig) {
              await store.getState().saveConfig(updatedConfig);
            }

            queryClient.invalidateQueries({ queryKey: ["annotations", bookId] });
          }
        } else {
          const ctx = getContextByRange(selection.range, 50);
          const newAnnotation = await createBookNote({
            bookId,
            type: "annotation",
            cfi,
            style,
            color,
            text: selection.text,
            note: "",
            context: {
              before: ctx.before,
              after: ctx.after,
            },
          });

          recordAnnotationChange(bookId, { kind: "create", note: newAnnotation });
          const updatedAnnotations = [...annotations, newAnnotation];
          const updatedConfig = store.getState().updateBooknotes(updatedAnnotations);

          view?.addAnnotation(newAnnotation);
          setSelection({ ...selection, annotated: true });

          if (updatedConfig) {
            await store.getState().saveConfig(updatedConfig);
          }

          queryClient.invalidateQueries({ queryKey: ["annotations", bookId] });
        }
      } catch (error) {
        console.error("Failed to handle highlight:", error);
        toast.error("Failed to save annotation");
      }
    },
    [selection, config, view, settings, bookId, store, queryClient],
  );

  // ---------- 评论：写完自动加波浪线，可选让 Nova 回评 ----------
  const commitNotes = useCallback(
    async (next: BookNote[]) => {
      const updatedConfig = store.getState().updateBooknotes(next);
      if (updatedConfig) await store.getState().saveConfig(updatedConfig);
      queryClient.invalidateQueries({ queryKey: ["annotations", bookId] });
    },
    [store, queryClient, bookId],
  );

  const addNote = useCallback(() => {
    if (!selection || !selection.text) return;
    const cfi = view?.getCFI(selection.index, selection.range);
    if (!cfi) return;
    const notes = store.getState().config?.booknotes ?? [];
    const existing = notes.find(
      (note) => note.cfi === cfi && note.type === "annotation" && !note.deletedAt && note.author !== "ai",
    );
    const gridFrame = document.querySelector(`#gridcell-${bookId}`);
    if (!gridFrame) return;
    const rect = gridFrame.getBoundingClientRect();
    const vertical = globalViewSettings?.vertical ?? false;
    const triangPos = getPosition(selection.range, rect, popupPadding, vertical);
    const width = Math.min(340, window.innerWidth - 2 * popupPadding);
    const height = 250;
    const position = getPopupPosition(
      triangPos,
      rect,
      vertical ? height : width,
      vertical ? width : height,
      popupPadding,
    );
    const ctx = getContextByRange(selection.range, 50);
    setCommentDraft({
      cfi,
      text: selection.text,
      context: { before: ctx.before, after: ctx.after },
      note: existing?.note ?? "",
      editing: Boolean(existing?.note),
      position,
      width,
    });
    handleDismissPopup();
  }, [selection, view, store, bookId, globalViewSettings, handleDismissPopup]);

  const cancelComment = useCallback(() => {
    setCommentDraft(null);
    view?.deselect();
  }, [view]);

  const submitComment = useCallback(
    async (text: string, askNovaReview: boolean) => {
      const draft = commentDraft;
      if (!draft) return;
      try {
        const notes = store.getState().config?.booknotes ?? [];
        const existing = notes.find(
          (note) => note.cfi === draft.cfi && note.type === "annotation" && !note.deletedAt && note.author !== "ai",
        );
        let saved: BookNote;
        if (existing) {
          saved = await updateBookNote(existing.id, {
            style: existing.style,
            color: existing.color,
            text: existing.text,
            note: text,
          });
          view?.addAnnotation(existing, true);
          view?.addAnnotation(saved);
          await commitNotes(notes.map((note) => (note.id === saved.id ? saved : note)));
        } else {
          saved = await createBookNote({
            bookId,
            type: "annotation",
            cfi: draft.cfi,
            style: "squiggly",
            color: settings.globalReadSettings.highlightStyles.squiggly ?? "yellow",
            text: draft.text,
            note: text,
            context: draft.context,
          });
          view?.addAnnotation(saved);
          await commitNotes([...notes, saved]);
          recordAnnotationChange(bookId, { kind: "create", note: saved });
        }
        setCommentDraft(null);
        view?.deselect();
        // 双链：批注栏定位到这条评论；点批注栏也能跳回原文
        useLayoutStore.getState().openNotepadAnnotation(saved.id);
        if (askNovaReview) {
          const toastId = toast.loading("Nova 正在读你的评论…");
          generateCommentReview({ bookId, source: saved, readerStore: store, queryClient })
            .then(({ mode }) =>
              toast.success(`Nova 回评了${mode ? `（${REVIEW_MODE_LABEL[mode]}）` : ""}`, { id: toastId }),
            )
            .catch((error: unknown) =>
              toast.error(`Nova 回评失败：${error instanceof Error ? error.message : String(error)}`, {
                id: toastId,
              }),
            );
        } else {
          toast.success(text ? "评论已保存" : "已加波浪线");
        }
      } catch (error) {
        console.error("保存评论失败:", error);
        toast.error("保存评论失败");
      }
    },
    [commentDraft, store, view, settings, bookId, queryClient, commitNotes],
  );

  // ---------- Ctrl+Z 撤销 / Ctrl+Y、Ctrl+Shift+Z 重做 划线与高亮 ----------
  const currentNotes = useCallback(() => store.getState().config?.booknotes ?? [], [store]);
  const linkedRepliesOf = useCallback(
    (noteId: string) =>
      currentNotes().filter((note) => note.author === "ai" && note.sourceNoteId === noteId && !note.deletedAt),
    [currentNotes],
  );

  const removeNotes = useCallback(
    async (targets: BookNote[]) => {
      for (const target of targets) {
        await deleteBookNote(target.id);
        view?.addAnnotation(target, true);
      }
      const ids = new Set(targets.map((target) => target.id));
      await commitNotes(currentNotes().filter((note) => !ids.has(note.id)));
    },
    [view, commitNotes, currentNotes],
  );

  const restoreChange = useCallback(
    async (change: AnnotationChange): Promise<AnnotationChange> => {
      const recreate = async (note: BookNote, sourceNoteId?: string | null) => {
        const created = await createBookNote({
          bookId,
          type: "annotation",
          cfi: note.cfi,
          text: note.text,
          style: note.style,
          color: note.color,
          author: note.author,
          sourceNoteId: sourceNoteId === undefined ? note.sourceNoteId : sourceNoteId,
          note: note.note,
          context: note.context,
        });
        view?.addAnnotation(created);
        return created;
      };
      const main = await recreate(change.note);
      const linked: BookNote[] = [];
      for (const reply of change.linked ?? []) linked.push(await recreate(reply, main.id));
      // 原划线被删时留下的 Nova 回评，重新挂回恢复后的划线
      let next = [...currentNotes(), main, ...linked];
      for (const orphan of linkedRepliesOf(change.note.id)) {
        const relinked = await updateBookNote(orphan.id, { sourceNoteId: main.id });
        next = next.map((note) => (note.id === relinked.id ? relinked : note));
      }
      await commitNotes(next);
      return { kind: change.kind, note: main, linked };
    },
    [bookId, view, commitNotes, currentNotes, linkedRepliesOf],
  );

  const undoAnnotation = useCallback(async () => {
    const change = takeUndo(bookId);
    if (!change) {
      toast("没有可以撤销的划线", { duration: 1200 });
      return;
    }
    try {
      if (change.kind === "create") {
        const current = currentNotes().find((note) => note.id === change.note.id) ?? change.note;
        const linked = linkedRepliesOf(current.id);
        await removeNotes([current, ...linked]);
        pushRedo(bookId, { kind: "create", note: current, linked });
        toast.success("已撤销划线（Ctrl+Y 重做）", { duration: 1500 });
      } else {
        pushRedo(bookId, await restoreChange(change));
        toast.success("已恢复划线（Ctrl+Y 重做）", { duration: 1500 });
      }
      setShowAnnotPopup(false);
    } catch (error) {
      console.error("撤销划线失败:", error);
      toast.error("撤销失败");
    }
  }, [bookId, currentNotes, linkedRepliesOf, removeNotes, restoreChange]);

  const redoAnnotation = useCallback(async () => {
    const change = takeRedo(bookId);
    if (!change) {
      toast("没有可以重做的操作", { duration: 1200 });
      return;
    }
    try {
      if (change.kind === "create") {
        pushUndo(bookId, await restoreChange(change));
      } else {
        const current = currentNotes().find((note) => note.id === change.note.id) ?? change.note;
        const linked = linkedRepliesOf(current.id);
        await removeNotes([current, ...linked]);
        pushUndo(bookId, { kind: "delete", note: current, linked });
      }
      toast.success("已重做", { duration: 1200 });
    } catch (error) {
      console.error("重做划线失败:", error);
      toast.error("重做失败");
    }
  }, [bookId, currentNotes, linkedRepliesOf, removeNotes, restoreChange]);

  const undoActionsRef = useRef({ undo: undoAnnotation, redo: redoAnnotation });
  undoActionsRef.current = { undo: undoAnnotation, redo: redoAnnotation };
  /** 阅读页 iframe 里的按键也要接上（iframe 内的事件不会冒泡到主窗口）。 */
  const handleUndoKeyDown = useCallback((event: KeyboardEvent) => {
    const action = undoKeyAction(event);
    if (!action || isEditableTarget(event.target)) return;
    event.preventDefault();
    void undoActionsRef.current[action]();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const { tabs, activeTabId, isHomeActive } = useLayoutStore.getState();
      if (isHomeActive) return;
      if (tabs.find((tab) => tab.id === activeTabId)?.bookId !== bookId) return;
      handleUndoKeyDown(event);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [bookId, handleUndoKeyDown]);

  const handleExplain = useCallback(() => {
    if (!selection || !selection.text) return;
    setShowAnnotPopup(false);
    iframeService.sendExplainTextRequest(selection.text, "explain", bookId);
  }, [selection, bookId]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  const handleAskAI = useCallback(() => {
    if (!selection || !selection.text) return;

    setShowAnnotPopup(false);
    setShowAskAIPopup(false);

    // Calculate position for AskAI popup
    const gridFrame = document.querySelector(`#gridcell-${bookId}`);
    if (!gridFrame) return;
    const rect = gridFrame.getBoundingClientRect();
    const triangPos = getPosition(selection.range, rect, popupPadding, globalViewSettings?.vertical);

    // Calculate AskAI popup position
    const askAIPopupWidth = 320;
    const askAIPopupHeight = 120;
    const askAIPopupPos = getPopupPosition(
      triangPos,
      rect,
      globalViewSettings?.vertical ? askAIPopupHeight : askAIPopupWidth,
      globalViewSettings?.vertical ? askAIPopupWidth : askAIPopupHeight,
      popupPadding,
    );

    if (triangPos.point.x === 0 || triangPos.point.y === 0) return;
    setAskAIPopupPosition(askAIPopupPos);

    setTimeout(() => {
      setShowAskAIPopup(true);
    }, 0);
  }, [selection, bookId, globalViewSettings, popupPadding]);

  const handleCloseAskAI = useCallback(() => {
    setShowAskAIPopup(false);
    view?.deselect();
  }, [view]);

  const handleSendAIQuery = useCallback(
    (query: string, selectedText: string) => {
      iframeService.sendAskAIRequest(selectedText, query, bookId);
      handleDismissPopupAndSelection();
    },
    [handleDismissPopupAndSelection, bookId],
  );

  // Popup 位置计算
  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    setHighlightOptionsVisible(!!selection?.annotated);
    if (selection && selection.text.trim().length > 0 && !showAskAIPopup) {
      const gridFrame = document.querySelector(`#gridcell-${bookId}`);

      if (!gridFrame) {
        return;
      }

      const rect = gridFrame.getBoundingClientRect();
      const triangPos = getPosition(selection.range, rect, popupPadding, globalViewSettings?.vertical);
      const annotPopupPos = getPopupPosition(
        triangPos,
        rect,
        globalViewSettings?.vertical ? annotPopupHeight : annotPopupWidth,
        globalViewSettings?.vertical ? annotPopupWidth : annotPopupHeight,
        popupPadding,
      );

      if (triangPos.point.x === 0 || triangPos.point.y === 0) {
        return;
      }

      setAnnotPopupPosition(annotPopupPos);
      setTrianglePosition(triangPos);
      setShowAnnotPopup(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, bookId, showAskAIPopup]);

  // 加载当前页面的标注
  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    if (!progress) return;
    const { location } = progress;
    const start = CFI.collapse(location);
    const end = CFI.collapse(location, true);
    const { booknotes = [] } = config;
    const annotations = booknotes.filter(
      (item) =>
        !item.deletedAt &&
        item.type === "annotation" &&
        item.style &&
        CFI.compare(item.cfi, start) >= 0 &&
        CFI.compare(item.cfi, end) <= 0,
    );
    try {
      Promise.all(annotations.map((annotation) => view?.addAnnotation(annotation)));
    } catch (e) {
      console.warn(e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress]);

  return {
    // 状态
    selection,
    setSelection,
    showAnnotPopup,
    showAskAIPopup,
    trianglePosition,
    annotPopupPosition,
    askAIPopupPosition,
    highlightOptionsVisible,
    selectedStyle,
    setSelectedStyle,
    selectedColor,
    setSelectedColor,
    annotPopupWidth,
    annotPopupHeight,

    // 函数
    handleDismissPopup,
    handleDismissPopupAndSelection,
    handleCopy,
    handleHighlight,
    addNote,
    commentDraft,
    submitComment,
    cancelComment,
    handleUndoKeyDown,
    undoAnnotation,
    redoAnnotation,
    handleExplain,
    handleAskAI,
    handleCloseAskAI,
    handleSendAIQuery,
  };
};

import { isJevPickNote } from "@/lib/co-reading-trigger";
import { NOVA_STATIC_AVATAR } from "@/components/nova/nova-assets";
import { askNova } from "@/components/nova/nova-bus";
import { getNovaExtras, useNovaExtras } from "@/components/nova/nova-extras";
import { NOTE_WORTH_EVENT, drawInkDot, getNoteWorth, inkStrength } from "@/components/nova/nova-ink";
import { NOTE_THREAD_EVENT, hasNoteThread } from "@/components/nova/nova-threads";
import { drawSoftHighlight, drawSoftUnderline } from "@/components/reading-page/annotation-draw";
import {
  ANNOTATION_PREFS_EVENT,
  HIGHLIGHT_OPACITY,
  UNDERLINE_WIDTH,
  getAnnotationPrefs,
  resolveAnnotationColor,
} from "@/lib/reading-page";
import { useThemeStore } from "@/store/theme-store";
import { HIGHLIGHT_COLOR_HEX } from "@/services/constants";
import { useAppSettingsStore } from "@/store/app-settings-store";
import { useLayoutStore } from "@/store/layout-store";
import type { BookNote } from "@/types/book";
import { MessageSquareText } from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { FiCopy, FiHelpCircle, FiMessageCircle } from "react-icons/fi";
import { PiHighlighterFill } from "react-icons/pi";
import { RiDeleteBinLine } from "react-icons/ri";
import { useAnnotator } from "../../hooks/use-annotator";
import { useFoliateEvents } from "../../hooks/use-foliate-events";
import { useTextSelector } from "../../hooks/use-text-selector";
import { useReaderStore, useReaderStoreApi } from "../reader-provider";
import AnnotationPopup from "./annotation-popup";
import AskAIPopup from "./ask-ai-popup";
import { CommentComposer } from "@/components/reading-page/comment-composer";

/** 墨点命中探测偏移：原位、往左（横排句末）、往上（竖排列末）。墨点半径 2.5–4.5px，离文字 2px。 */
const INK_HIT_PROBES: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [-6, 0],
  [-11, 0],
  [-16, 0],
  [0, -6],
  [0, -11],
  [0, -16],
];

/** 触屏选字：选区停止变化这么久后弹出划线菜单（拖动选区手柄时不打断）。 */
const TOUCH_SELECTION_SETTLE_MS = 450;

function NovaIcon({ size = 16 }: { size?: number }) {
  return <img src={NOVA_STATIC_AVATAR} alt="" width={size} height={size} className="rounded-full" />;
}

const Annotator: React.FC = () => {
  const { settings } = useAppSettingsStore();
  const store = useReaderStoreApi();

  const bookId = useReaderStore((state) => state.bookId)!;
  const view = useReaderStore((state) => state.view);

  const globalViewSettings = settings.globalViewSettings;

  // 使用 use-annotator hook
  const {
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
    handleDismissPopup,
    handleCopy,
    handleHighlight,
    addNote,
    commentDraft,
    submitComment,
    cancelComment,
    handleUndoKeyDown,
    handleExplain,
    handleAskAI,
    handleCloseAskAI,
    handleSendAIQuery,
  } = useAnnotator({ bookId });

  const { handleScroll, handleMouseUp, handleShowPopup, markAnnotationTapped } = useTextSelector(
    bookId,
    setSelection,
    handleDismissPopup,
  );

  // 墨点边注：鼠标移到带墨点的句子上时，浮出 Nova 的边注。
  const [inkTip, setInkTip] = useState<{ id: string; text: string; x: number; y: number } | null>(null);
  const updateInkTip = (doc: Document, event: MouseEvent) => {
    if (getNovaExtras().aiNoteStyle !== "ink") {
      setInkTip((current) => (current ? null : current));
      return;
    }
    const content = store
      .getState()
      .view?.renderer.getContents()
      .find((item) => item.doc === doc);
    const overlayer = content?.overlayer as { hitTest?: (point: { x: number; y: number }) => unknown[] } | undefined;
    const booknotes = store.getState().config?.booknotes ?? [];
    // hitTest 只认句子文字本身的矩形，而墨点画在句末外侧几像素处；
    // 鼠标落在墨点上时往左（竖排往上）探几下，找到它所属的句子。
    let note: BookNote | undefined;
    for (const [dx, dy] of INK_HIT_PROBES) {
      const [key] = (overlayer?.hitTest?.({ x: event.clientX + dx, y: event.clientY + dy }) ?? []) as [string?];
      if (!key) continue;
      note = booknotes.find(
        (item) =>
          (item.cfi === key || item.id === key) &&
          item.type === "annotation" &&
          item.author === "ai" &&
          !item.deletedAt &&
          item.note,
      );
      if (note) break;
    }
    if (!note?.note) {
      setInkTip((current) => (current ? null : current));
      return;
    }
    const frame = (doc.defaultView?.frameElement as HTMLElement | null)?.getBoundingClientRect();
    const text = note.note;
    setInkTip((current) =>
      current?.id === note.id
        ? current
        : { id: note.id, text, x: (frame?.left ?? 0) + event.clientX, y: (frame?.top ?? 0) + event.clientY },
    );
  };

  const onLoad = (event: Event) => {
    const detail = (event as CustomEvent).detail;
    const { doc, index } = detail;

    view?.renderer?.addEventListener("scroll", handleScroll);

    if (detail.doc) {
      detail.doc.addEventListener("mouseup", () => {
        handleMouseUp(doc, index);
      });
      // 平板 / 手机：长按选字不会触发 mouseup。选区停止变化一小会儿后，按「松开鼠标」同样处理，弹出划线 / 评论菜单。
      let lastPointerType = window.matchMedia?.("(pointer: coarse)").matches ? "touch" : "mouse";
      let selectionTimer = 0;
      detail.doc.addEventListener(
        "pointerdown",
        (pointerEvent: PointerEvent) => {
          lastPointerType = pointerEvent.pointerType || lastPointerType;
        },
        true,
      );
      detail.doc.addEventListener("selectionchange", () => {
        if (lastPointerType === "mouse") return;
        window.clearTimeout(selectionTimer);
        selectionTimer = window.setTimeout(() => {
          const sel = doc.getSelection?.();
          if (sel && !sel.isCollapsed && sel.toString().trim()) handleMouseUp(doc, index);
        }, TOUCH_SELECTION_SETTLE_MS);
      });
      let pending = 0;
      detail.doc.addEventListener("mousemove", (moveEvent: MouseEvent) => {
        if (pending) return;
        pending = window.requestAnimationFrame(() => {
          pending = 0;
          updateInkTip(doc, moveEvent);
        });
      });
      detail.doc.addEventListener("mouseleave", () => setInkTip(null));
      detail.doc.addEventListener("keydown", handleUndoKeyDown);
    }
  };

  // 切换 AI 边注样式后，重新画一遍已有的 AI 边注。
  const aiNoteStyle = useNovaExtras().aiNoteStyle;
  const drawnStyleRef = useRef(aiNoteStyle);
  useEffect(() => {
    if (drawnStyleRef.current === aiNoteStyle) return;
    drawnStyleRef.current = aiNoteStyle;
    setInkTip(null);
    const notes =
      store
        .getState()
        .config?.booknotes?.filter((note) => note.type === "annotation" && note.author === "ai" && !note.deletedAt) ??
      [];
    for (const note of notes) void view?.addAnnotation(note);
  }, [aiNoteStyle, view, store]);

  // 划线样式 / 高亮浓淡 / 配色变了：全部标注重画
  useEffect(() => {
    const redraw = () => {
      const notes =
        store.getState().config?.booknotes?.filter((note) => note.type === "annotation" && !note.deletedAt) ?? [];
      // 隐藏时要主动移除已经画上的（不调用 draw 不会清掉旧的）。
      const hidden = getAnnotationPrefs().hideOnPage;
      for (const note of notes) void view?.addAnnotation(note, hidden || isJevPickNote(note));
    };
    window.addEventListener(ANNOTATION_PREFS_EVENT, redraw);
    return () => window.removeEventListener(ANNOTATION_PREFS_EVENT, redraw);
  }, [view, store]);

  // Jev 给新边注打出价值分后，墨点样式下按新深浅重画这一条。
  useEffect(() => {
    const onWorth = (event: Event) => {
      if (getNovaExtras().aiNoteStyle !== "ink") return;
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      const note = store
        .getState()
        .config?.booknotes?.find(
          (item) => item.id === id && item.type === "annotation" && item.author === "ai" && !item.deletedAt,
        );
      if (note) void view?.addAnnotation(note);
    };
    // 评论区有了新对话：墨点外面加上细环
    const onThread = (event: Event) => {
      const detail = (event as CustomEvent<{ bookId?: string; annotationId?: string }>).detail;
      if (detail?.bookId !== bookId) return;
      onWorth(new CustomEvent(NOTE_WORTH_EVENT, { detail: { id: detail.annotationId } }));
    };
    window.addEventListener(NOTE_WORTH_EVENT, onWorth);
    window.addEventListener(NOTE_THREAD_EVENT, onThread);
    return () => {
      window.removeEventListener(NOTE_WORTH_EVENT, onWorth);
      window.removeEventListener(NOTE_THREAD_EVENT, onThread);
    };
  }, [view, store, bookId]);

  const onDrawAnnotation = (event: Event) => {
    const detail = (event as CustomEvent).detail;
    const { draw, annotation, doc, range } = detail;
    const { style, color } = annotation as BookNote;
    // JEV 波浪线已停用：以前划的也不再画出来。
    if (isJevPickNote(annotation as BookNote)) return;
    const prefs = getAnnotationPrefs();
    // 「在书上隐藏划线和批注」打开时什么都不画（数据还在，书评区照常显示）。
    if (prefs.hideOnPage) return;
    const hexColor = resolveAnnotationColor(color, prefs, HIGHLIGHT_COLOR_HEX);
    if ((annotation as BookNote).author === "ai" && getNovaExtras().aiNoteStyle === "ink") {
      const node = range.startContainer;
      const el = node.nodeType === 1 ? node : node.parentElement;
      const writingMode: string = el ? doc.defaultView.getComputedStyle(el).writingMode : "";
      draw(drawInkDot, {
        color: hexColor,
        strength: inkStrength((annotation as BookNote).note, getNoteWorth((annotation as BookNote).id)),
        vertical: writingMode.startsWith("vertical"),
        bounds: { width: doc.documentElement.scrollWidth, height: doc.documentElement.scrollHeight },
        threaded: hasNoteThread(bookId, (annotation as BookNote).id),
      });
      return;
    }
    if (style === "highlight") {
      draw(drawSoftHighlight, {
        color: hexColor,
        opacity: HIGHLIGHT_OPACITY[prefs.highlightStrength],
        dark: useThemeStore.getState().isDarkMode,
      });
    } else if (["underline", "squiggly"].includes(style as string)) {
      const node = range.startContainer;
      const el = node.nodeType === 1 ? node : node.parentElement;
      const writingMode: string = el ? doc.defaultView.getComputedStyle(el).writingMode : "";
      draw(drawSoftUnderline, {
        color: hexColor,
        style: style === "squiggly" ? "wavy" : prefs.underlineStyle,
        width: UNDERLINE_WIDTH[prefs.underlineWeight],
        vertical: writingMode.startsWith("vertical"),
      });
    }
  };

  const onShowAnnotation = (event: Event) => {
    const detail = (event as CustomEvent).detail;
    const { value: cfi, index, range } = detail;
    const annotationId = (detail.annotation as BookNote | undefined)?.id;
    const currentConfig = store.getState().config;

    const { booknotes = [] } = currentConfig!;
    const annotations = booknotes.filter((booknote) => booknote.type === "annotation" && !booknote.deletedAt);
    const annotation = annotations.find((annotation) =>
      annotationId ? annotation.id === annotationId : annotation.cfi === cfi,
    );

    if (!annotation) return;
    // 这次点击是点在已有标注上：别再当成「点屏幕两侧翻页」
    markAnnotationTapped();

    if (annotation.author === "ai") {
      // 只在左侧书评区定位到这条；不再联动打开右侧栏（主人觉得多余）。
      useLayoutStore.getState().openNotepadAnnotation(annotation.id);
      return;
    }

    // 双链：点带评论的划线，批注栏同步定位到这条评论
    if (annotation.note?.trim()) {
      useLayoutStore.getState().openNotepadAnnotation(annotation.id);
    }

    const newSelection = {
      key: bookId,
      annotated: true,
      text: annotation.text ?? "",
      range,
      index,
    };

    setSelectedStyle(annotation.style!);
    setSelectedColor(annotation.color!);
    setSelection(newSelection);
  };

  useFoliateEvents(view, { onLoad, onDrawAnnotation, onShowAnnotation });

  // 同步 popup 显示状态到 text selector
  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    handleShowPopup(showAnnotPopup || showAskAIPopup || Boolean(commentDraft));
  }, [showAnnotPopup, showAskAIPopup, commentDraft]);

  const selectionAnnotated = selection?.annotated;
  // 问 Nova：Nova 在场时把选中的文字交给她（回答显示在 Nova 气泡里），否则退回到侧栏解释。
  const handleAskNova = () => {
    const text = selection?.text?.trim();
    if (!text) return;
    if (askNova(bookId, { text })) handleDismissPopup();
    else handleExplain();
  };
  const buttons = [
    { label: "复制", Icon: FiCopy, onClick: handleCopy },
    { label: "解释", Icon: FiHelpCircle, onClick: handleExplain },
    { label: "问Nova", Icon: NovaIcon, onClick: handleAskNova },
    { label: "询问AI", Icon: FiMessageCircle, onClick: handleAskAI },
    {
      label: undefined,
      Icon: selectionAnnotated ? RiDeleteBinLine : PiHighlighterFill,
      onClick: handleHighlight,
    },
    { label: "评论", Icon: MessageSquareText, onClick: addNote },
  ];

  return (
    <div>
      {inkTip && (
        <div
          className="pointer-events-none fixed z-50 w-72 rounded-xl border-2 border-amber-300 bg-amber-50 px-3 py-2 text-amber-950 text-xs leading-relaxed shadow-lg dark:border-amber-800 dark:bg-amber-950 dark:text-amber-50"
          style={{
            left: Math.max(8, Math.min(inkTip.x + 12, window.innerWidth - 300)),
            // 鼠标在屏幕下半部分时浮窗往上开，避免章末、页底的边注被窗口底边截断
            ...(inkTip.y > window.innerHeight * 0.55
              ? { bottom: Math.max(8, window.innerHeight - inkTip.y + 12) }
              : { top: Math.max(8, inkTip.y + 16) }),
            maxHeight: "min(60vh, 28rem)",
          }}
        >
          <span className="mb-1 block font-semibold text-[11px] opacity-70">Nova 的边注 · 点击查看详情</span>
          <span className="line-clamp-[16] block whitespace-pre-line">{inkTip.text}</span>
        </div>
      )}
      {showAnnotPopup && !showAskAIPopup && trianglePosition && annotPopupPosition && (
        <AnnotationPopup
          dir={globalViewSettings?.rtl ? "rtl" : "ltr"}
          isVertical={globalViewSettings?.vertical ?? false}
          buttons={buttons}
          position={annotPopupPosition}
          trianglePosition={trianglePosition}
          highlightOptionsVisible={highlightOptionsVisible}
          selectedStyle={selectedStyle}
          selectedColor={selectedColor}
          popupWidth={annotPopupWidth}
          popupHeight={annotPopupHeight}
          onHighlight={handleHighlight}
        />
      )}
      {commentDraft && (
        <CommentComposer
          key={commentDraft.cfi}
          style={{
            left: `${commentDraft.position.point.x}px`,
            top: `${commentDraft.position.point.y + 15}px`,
            width: `${commentDraft.width}px`,
          }}
          quote={commentDraft.text}
          initialNote={commentDraft.note}
          editing={commentDraft.editing}
          onCancel={cancelComment}
          onSubmit={submitComment}
        />
      )}
      {showAskAIPopup && askAIPopupPosition && selection && (
        <AskAIPopup
          style={{
            left: `${askAIPopupPosition.point.x}px`,
            top: `${askAIPopupPosition.point.y + 15}px`,
            width: "320px",
          }}
          selectedText={selection.text}
          onClose={handleCloseAskAI}
          onSendQuery={handleSendAIQuery}
        />
      )}
    </div>
  );
};

export default Annotator;

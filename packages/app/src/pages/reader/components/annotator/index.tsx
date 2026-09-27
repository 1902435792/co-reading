import { openReadingFootprintForAnnotation } from "@/components/side-chat/co-reading-backlink";
import { NOVA_STATIC_AVATAR } from "@/components/nova/nova-assets";
import { askNova } from "@/components/nova/nova-bus";
import { getNovaExtras, useNovaExtras } from "@/components/nova/nova-extras";
import { NOTE_WORTH_EVENT, drawInkDot, getNoteWorth, inkStrength } from "@/components/nova/nova-ink";
import { HIGHLIGHT_COLOR_HEX } from "@/services/constants";
import { useAppSettingsStore } from "@/store/app-settings-store";
import { useLayoutStore } from "@/store/layout-store";
import type { BookNote } from "@/types/book";
import { Overlayer } from "foliate-js/overlayer.js";
import { NotebookPen } from "lucide-react";
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
    handleExplain,
    handleAskAI,
    handleCloseAskAI,
    handleSendAIQuery,
  } = useAnnotator({ bookId });

  const { handleScroll, handleMouseUp, handleShowPopup } = useTextSelector(
    bookId,
    setSelection,
    handleDismissPopup
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
    const [key] = (overlayer?.hitTest?.({ x: event.clientX, y: event.clientY }) ?? []) as [string?];
    const note = key
      ? store
          .getState()
          .config?.booknotes?.find(
            (item) => (item.cfi === key || item.id === key) && item.author === "ai" && !item.deletedAt && item.note,
          )
      : undefined;
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
      let pending = 0;
      detail.doc.addEventListener("mousemove", (moveEvent: MouseEvent) => {
        if (pending) return;
        pending = window.requestAnimationFrame(() => {
          pending = 0;
          updateInkTip(doc, moveEvent);
        });
      });
      detail.doc.addEventListener("mouseleave", () => setInkTip(null));
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
        .config?.booknotes?.filter((note) => note.type === "annotation" && note.author === "ai" && !note.deletedAt) ?? [];
    for (const note of notes) void view?.addAnnotation(note);
  }, [aiNoteStyle, view, store]);

  // Jev 给新边注打出价值分后，墨点样式下按新深浅重画这一条。
  useEffect(() => {
    const onWorth = (event: Event) => {
      if (getNovaExtras().aiNoteStyle !== "ink") return;
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      const note = store
        .getState()
        .config?.booknotes?.find((item) => item.id === id && item.author === "ai" && !item.deletedAt);
      if (note) void view?.addAnnotation(note);
    };
    window.addEventListener(NOTE_WORTH_EVENT, onWorth);
    return () => window.removeEventListener(NOTE_WORTH_EVENT, onWorth);
  }, [view, store]);

  const onDrawAnnotation = (event: Event) => {
    const detail = (event as CustomEvent).detail;
    const { draw, annotation, doc, range } = detail;
    const { style, color } = annotation as BookNote;
    const hexColor = color ? HIGHLIGHT_COLOR_HEX[color] : color;
    if ((annotation as BookNote).author === "ai" && getNovaExtras().aiNoteStyle === "ink") {
      const node = range.startContainer;
      const el = node.nodeType === 1 ? node : node.parentElement;
      const writingMode: string = el ? doc.defaultView.getComputedStyle(el).writingMode : "";
      draw(drawInkDot, {
        color: hexColor,
        strength: inkStrength((annotation as BookNote).note, getNoteWorth((annotation as BookNote).id)),
        vertical: writingMode.startsWith("vertical"),
      });
      return;
    }
    if (style === "highlight") {
      draw(Overlayer.highlight, { color: hexColor });
    } else if (["underline", "squiggly"].includes(style as string)) {
      const { defaultView } = doc;
      const node = range.startContainer;
      const el = node.nodeType === 1 ? node : node.parentElement;
      const { writingMode, lineHeight, fontSize } =
        defaultView.getComputedStyle(el);
      const lineHeightValue =
        Number.parseFloat(lineHeight) ||
        globalViewSettings?.lineHeight! * globalViewSettings?.defaultFontSize!;
      const fontSizeValue =
        Number.parseFloat(fontSize) || globalViewSettings?.defaultFontSize;
      const strokeWidth = 2;
      const padding = globalViewSettings?.vertical
        ? (lineHeightValue - fontSizeValue! - strokeWidth) / 2
        : strokeWidth;
      draw(Overlayer[style as keyof typeof Overlayer], {
        writingMode,
        color: hexColor,
        padding,
      });
    }
  };

  const onShowAnnotation = (event: Event) => {
    const detail = (event as CustomEvent).detail;
    const { value: cfi, index, range } = detail;
    const annotationId = (detail.annotation as BookNote | undefined)?.id;
    const currentConfig = store.getState().config;

    const { booknotes = [] } = currentConfig!;
    const annotations = booknotes.filter(
      (booknote) => booknote.type === "annotation" && !booknote.deletedAt
    );
    const annotation = annotations.find((annotation) =>
      annotationId ? annotation.id === annotationId : annotation.cfi === cfi
    );

    if (!annotation) return;

    if (annotation.author === "ai") {
      // 左侧批注栏高亮 + 右侧阅读地图联动
      useLayoutStore.getState().openNotepadAnnotation(annotation.id);
      const opened = openReadingFootprintForAnnotation({
        bookId,
        annotation,
        setPendingReadingFootprint: store.getState().setPendingReadingFootprint,
        eventTarget: typeof window !== "undefined" ? window : undefined,
      });
      if (opened) {
        useLayoutStore.setState({ isChatVisible: true });
      }
      return;
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
    handleShowPopup(showAnnotPopup || showAskAIPopup);
  }, [showAnnotPopup, showAskAIPopup]);

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
    { label: "想法", Icon: NotebookPen, onClick: addNote },
  ];

  return (
    <div>
      {inkTip && (
        <div
          className="pointer-events-none fixed z-50 w-72 rounded-xl border-2 border-amber-300 bg-amber-50 px-3 py-2 text-amber-950 text-xs leading-relaxed shadow-lg dark:border-amber-800 dark:bg-amber-950/90 dark:text-amber-50"
          style={{
            left: Math.max(8, Math.min(inkTip.x + 12, window.innerWidth - 300)),
            top: Math.max(8, Math.min(inkTip.y + 16, window.innerHeight - 170)),
          }}
        >
          <span className="mb-1 block font-semibold text-[11px] opacity-70">Nova 的边注 · 点击查看详情</span>
          <span className="line-clamp-6 block whitespace-pre-line">{inkTip.text}</span>
        </div>
      )}
      {showAnnotPopup &&
        !showAskAIPopup &&
        trianglePosition &&
        annotPopupPosition && (
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

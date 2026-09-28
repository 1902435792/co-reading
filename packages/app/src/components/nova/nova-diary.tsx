import { installDiaryCloseGuard } from "@/services/diary-background";
import { CoReadingDiaryDialog } from "@/components/side-chat/co-reading-diary-dialog";
import { CO_READING_DIARY_DEFAULT_COUNT, getCoReadingDiarySelectionState } from "@/lib/co-reading-diary";
import { getCoReadingDiarySources } from "@/services/co-reading-service";
import { useProviderStore } from "@/store/provider-store";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { NOVA_STATIC_AVATAR } from "./nova-assets";
import { type DiaryTrigger, diaryProposalText, isVcpBridgeUrl, shouldProposeDiary } from "./nova-memory";

const OPEN_EVENT = "deepreader:open-coreading-diary";
const proposedKey = (bookId: string) => `deepreader:nova-diary-proposed:${bookId}`;

/** 写日记走问答 Agent 当前选中的模型；只有它指向 VCP Bridge 时才提议。 */
export function isDiaryRouteReady(): boolean {
  const state = useProviderStore.getState();
  const selected = state.selectedModel;
  if (!selected) return false;
  const provider = state.modelProviders.find((item) => item.provider === selected.providerId && item.active);
  return Boolean(provider?.apiKey?.trim()) && isVcpBridgeUrl(provider?.baseUrl);
}

export function openCoReadingDiary(bookId: string, bookTitle: string) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { bookId, bookTitle } }));
}

export interface DiaryProposal {
  title: string;
  description: string;
  unwrittenCount: number;
}

/**
 * 判断现在要不要提议写日记。返回 null 表示不提议。
 * 返回提议时会记下时间，同一本书在冷却期内不会再提。
 */
export async function checkDiaryProposal(input: {
  bookId: string;
  trigger: DiaryTrigger;
  activeMs?: number | null;
}): Promise<DiaryProposal | null> {
  if (!isDiaryRouteReady()) return null;
  const now = Date.now();
  const lastProposedAt = Number(window.localStorage.getItem(proposedKey(input.bookId))) || null;
  const base = { trigger: input.trigger, activeMs: input.activeMs, lastProposedAt, now };
  // 先用「记录足够多」的假设做一次便宜的判断，避免无谓地读数据库。
  if (!shouldProposeDiary({ ...base, unwrittenCount: Number.MAX_SAFE_INTEGER })) return null;
  try {
    const records = await getCoReadingDiarySources(input.bookId);
    const { unwrittenCount } = getCoReadingDiarySelectionState(records, CO_READING_DIARY_DEFAULT_COUNT);
    if (!shouldProposeDiary({ ...base, unwrittenCount })) return null;
    window.localStorage.setItem(proposedKey(input.bookId), String(now));
    return { ...diaryProposalText(input.trigger, unwrittenCount), unwrittenCount };
  } catch {
    return null;
  }
}

/** 用 toast 提议（阅读页已经关闭时用）。 */
export function toastDiaryProposal(proposal: DiaryProposal, bookId: string, bookTitle: string) {
  toast(proposal.title, {
    description: proposal.description,
    icon: <img src={NOVA_STATIC_AVATAR} alt="" className="size-6 rounded-full" />,
    duration: 15_000,
    action: { label: "写日记", onClick: () => openCoReadingDiary(bookId, bookTitle) },
  });
}

/** 挂在应用根部：阅读页关掉以后也能打开共读日记对话框。 */
export function NovaDiaryHost() {
  const [target, setTarget] = useState<{ bookId: string; bookTitle: string } | null>(null);
  // 桌面版：写日记时关窗口，先藏起来等写完再退出。
  useEffect(() => installDiaryCloseGuard(), []);
  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ bookId?: string; bookTitle?: string }>).detail;
      if (detail?.bookId) setTarget({ bookId: detail.bookId, bookTitle: detail.bookTitle || "这本书" });
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);
  if (!target) return null;
  return (
    <CoReadingDiaryDialog
      open
      onOpenChange={(open) => {
        if (!open) setTarget(null);
      }}
      bookId={target.bookId}
      bookTitle={target.bookTitle}
    />
  );
}

import type { ChapterCard } from "./chapter-card";

const MAX_CARDS_PER_BOOK = 50;
const keyOf = (bookId: string) => `deepreader:chapter-cards:${bookId}`;

function isCard(value: unknown): value is ChapterCard {
  const card = value as ChapterCard | null;
  return Boolean(
    card &&
      typeof card.id === "string" &&
      typeof card.sectionIndex === "number" &&
      typeof card.summary === "string" &&
      Array.isArray(card.points) &&
      Array.isArray(card.questions),
  );
}

/** 最新的卡片排在最前面。 */
export function loadChapterCards(bookId: string): ChapterCard[] {
  try {
    const raw = window.localStorage.getItem(keyOf(bookId));
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter(isCard) : [];
  } catch {
    return [];
  }
}

/** 同一章只保留最新的一张。 */
export function saveChapterCard(card: ChapterCard): ChapterCard[] {
  const next = [card, ...loadChapterCards(card.bookId).filter((item) => item.sectionIndex !== card.sectionIndex)].slice(
    0,
    MAX_CARDS_PER_BOOK,
  );
  try {
    window.localStorage.setItem(keyOf(card.bookId), JSON.stringify(next));
  } catch {
    // 存储满了也不影响本次查看。
  }
  return next;
}

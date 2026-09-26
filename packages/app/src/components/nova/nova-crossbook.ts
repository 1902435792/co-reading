// 跨书联想：纯函数，便于 node 测试。不引用 "@/…" 路径。

export interface CrossBookShelfBook {
  id: string;
  title: string;
  /** 0–1 */
  progress?: number;
  status?: "unread" | "reading" | "completed";
}

export interface CrossBookConcept {
  id: string;
  key: string;
  value: string;
  bookId?: string;
}

export type CrossBookLink =
  | {
      kind: "book";
      key: string;
      bookId: string;
      title: string;
      progress?: number;
      status?: CrossBookShelfBook["status"];
    }
  | { kind: "concept"; key: string; bookId: string; title: string; concept: string; value: string };

/** 去掉书名号、括号里的版本说明和空白，便于比较。 */
export function normalizeBookTitle(title: string): string {
  return title
    .replace(/[《》]/g, "")
    .replace(/[（(【[][^）)】\]]*[）)】\]]\s*$/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

const isAsciiWord = (value: string) => /^[\x20-\x7e]+$/.test(value);
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function mentions(text: string, term: string): boolean {
  if (isAsciiWord(term)) {
    if (term.length < 4) return false;
    return new RegExp(`(^|[^A-Za-z0-9])${escapeRegExp(term)}($|[^A-Za-z0-9])`, "i").test(text);
  }
  return term.length >= 2 && text.includes(term);
}

function mentionsTitle(text: string, title: string): boolean {
  if (title.length < 2) return false;
  if (text.includes(`《${title}》`)) return true;
  // 不带书名号时要求书名足够长，免得「时间」「人类」这类短书名误报。
  return title.length >= 4 && mentions(text, title);
}

/**
 * 在当前页文字里找和其他书的联系：先找提到书架上其他书的地方，再找在其他书里记下过的概念。
 * shown 里的 key 已经提示过，不再重复。
 */
export function findCrossBookLinks(input: {
  text: string;
  currentBookId: string;
  currentTitle?: string;
  books: readonly CrossBookShelfBook[];
  concepts: readonly CrossBookConcept[];
  shown?: ReadonlySet<string>;
  max?: number;
}): CrossBookLink[] {
  const { text, currentBookId, books, concepts } = input;
  const shown = input.shown ?? new Set<string>();
  const max = input.max ?? 1;
  const current = normalizeBookTitle(input.currentTitle ?? "");
  const titleById = new Map(books.map((book) => [book.id, normalizeBookTitle(book.title)]));
  const links: CrossBookLink[] = [];
  if (!text.trim()) return links;

  for (const book of books) {
    if (book.id === currentBookId) continue;
    const title = normalizeBookTitle(book.title);
    if (!title || title === current) continue;
    const key = `book:${book.id}`;
    if (shown.has(key) || !mentionsTitle(text, title)) continue;
    links.push({ kind: "book", key, bookId: book.id, title, progress: book.progress, status: book.status });
  }

  const conceptLinks: CrossBookLink[] = [];
  for (const concept of concepts) {
    if (!concept.bookId || concept.bookId === currentBookId) continue;
    const term = concept.key.trim();
    const title = titleById.get(concept.bookId);
    const key = `concept:${concept.id}`;
    if (!title || shown.has(key) || !mentions(text, term)) continue;
    conceptLinks.push({
      kind: "concept",
      key,
      bookId: concept.bookId,
      title,
      concept: term,
      value: concept.value.trim(),
    });
  }
  // 长的概念词更具体，排在前面。
  conceptLinks.sort(
    (a, b) => (b.kind === "concept" ? b.concept.length : 0) - (a.kind === "concept" ? a.concept.length : 0),
  );

  return [...links, ...conceptLinks].slice(0, max);
}

const clip = (value: string, max: number) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);

export function crossBookLine(link: CrossBookLink): string {
  if (link.kind === "concept") {
    return `「${link.concept}」你在《${link.title}》里也遇到过：${clip(link.value, 70)}`;
  }
  if (link.status === "completed") return `这里提到了《${link.title}》——你已经读完它了，要不要对照着想想？`;
  const percent = link.progress !== undefined ? Math.round(link.progress * 100) : 0;
  if (percent > 0) return `这里提到了《${link.title}》——你书架上就有，读到 ${percent}% 了。`;
  return `这里提到了《${link.title}》——你书架上就有，还没开始读。`;
}

// ---------- 已提示记录（每本书） ----------

const shownKey = (bookId: string) => `deepreader:nova-crossbook-shown:${bookId}`;
const MAX_SHOWN = 200;

export function loadCrossBookShown(bookId: string): Set<string> {
  try {
    const list = JSON.parse(globalThis.localStorage?.getItem(shownKey(bookId)) ?? "[]") as unknown;
    return new Set(Array.isArray(list) ? list.filter((item): item is string => typeof item === "string") : []);
  } catch {
    return new Set();
  }
}

export function rememberCrossBookShown(bookId: string, key: string): void {
  try {
    const list = [...loadCrossBookShown(bookId), key].slice(-MAX_SHOWN);
    globalThis.localStorage?.setItem(shownKey(bookId), JSON.stringify(list));
  } catch {
    // 忽略
  }
}

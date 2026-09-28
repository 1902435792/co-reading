// 快捷按钮（总结本章 / 知识图谱 / 预读导航）按需附带的材料。
// formatToc / clipChapterSoFar 是纯函数，方便单元测试；DOM 取文在 side-chat 里调用。

export interface TocLike {
  label: string;
  subitems?: TocLike[];
}

/** 把目录压成缩进文本（最多两层、最多 maxLines 行），标出当前章节。 */
export function formatToc(toc: readonly TocLike[] | undefined, currentLabel?: string, maxLines = 120): string {
  if (!toc || toc.length === 0) return "";
  const lines: string[] = [];
  const current = currentLabel?.trim();
  const walk = (items: readonly TocLike[], depth: number) => {
    for (const item of items) {
      if (lines.length >= maxLines) return;
      const label = item.label?.trim();
      if (!label) continue;
      const mark = current && label === current ? "  ← 主人正在读" : "";
      lines.push(`${"  ".repeat(depth)}- ${label}${mark}`);
      if (depth < 1 && item.subitems?.length) walk(item.subitems, depth + 1);
    }
  };
  walk(toc, 0);
  const total = countToc(toc);
  if (total > lines.length) lines.push(`……（共 ${total} 项，只列出前 ${lines.length} 项）`);
  return lines.join("\n");
}

function countToc(items: readonly TocLike[], depth = 0): number {
  return items.reduce(
    (sum, item) => sum + 1 + (depth < 1 && item.subitems ? countToc(item.subitems, depth + 1) : 0),
    0,
  );
}

/** 本章「开头到当前位置」的文字：太长时保留最近的部分。 */
export function clipChapterSoFar(text: string, max = 12_000): string {
  const clean = text.replace(/\n{3,}/g, "\n\n").trim();
  if (clean.length <= max) return clean;
  return `（本章前面较长，只保留最近的 ${max} 字）\n……${clean.slice(clean.length - max)}`;
}

/** 从章节文档开头取到可见区域末尾（不含后面没读的部分）。 */
export function chapterTextUntil(range: Range): string {
  const doc = range.startContainer.ownerDocument;
  const body = doc?.body;
  if (!doc || !body) return "";
  const soFar = doc.createRange();
  soFar.setStart(body, 0);
  soFar.setEnd(range.endContainer, range.endOffset);
  return soFar.toString();
}

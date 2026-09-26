import assert from "node:assert/strict";
import test from "node:test";
import { crossBookLine, findCrossBookLinks, normalizeBookTitle } from "./nova-crossbook.ts";

const books = [
  { id: "a", title: "人类简史", progress: 0.37, status: "reading" as const },
  { id: "b", title: "时间", progress: 0, status: "unread" as const },
  { id: "c", title: "Gödel, Escher, Bach", progress: 1, status: "completed" as const },
  { id: "self", title: "枪炮、病菌与钢铁（修订版）" },
];

test("normalizeBookTitle strips brackets and edition notes", () => {
  assert.equal(normalizeBookTitle("《枪炮、病菌与钢铁》（修订版）"), "枪炮、病菌与钢铁");
  assert.equal(normalizeBookTitle("  Deep   Work "), "Deep Work");
});

test("finds a bookshelf title mentioned on the page", () => {
  const links = findCrossBookLinks({
    text: "正如《人类简史》所说，农业革命……",
    currentBookId: "self",
    books,
    concepts: [],
  });
  assert.equal(links.length, 1);
  assert.equal(links[0]?.key, "book:a");
});

test("short titles need 书名号; the current book is ignored", () => {
  assert.equal(findCrossBookLinks({ text: "时间过得很快", currentBookId: "self", books, concepts: [] }).length, 0);
  assert.equal(findCrossBookLinks({ text: "读《时间》这本书", currentBookId: "self", books, concepts: [] }).length, 1);
  assert.equal(
    findCrossBookLinks({
      text: "《枪炮、病菌与钢铁》",
      currentBookId: "self",
      currentTitle: "枪炮、病菌与钢铁（修订版）",
      books,
      concepts: [],
    }).length,
    0,
  );
});

test("finds concepts remembered from other books, skipping shown ones", () => {
  const concepts = [
    { id: "m1", key: "涌现", value: "简单规则产生复杂整体", bookId: "c" },
    { id: "m2", key: "农业革命", value: "史上最大骗局", bookId: "a" },
    { id: "m3", key: "本书概念", value: "x", bookId: "self" },
    { id: "m4", key: "AI", value: "too short", bookId: "a" },
  ];
  const text = "农业革命带来的涌现现象……本书概念 AI";
  const links = findCrossBookLinks({ text, currentBookId: "self", books, concepts, max: 5 });
  assert.equal(links.map((link) => link.key).join(","), "concept:m2,concept:m1");
  const rest = findCrossBookLinks({
    text,
    currentBookId: "self",
    books,
    concepts,
    shown: new Set(["concept:m2"]),
    max: 5,
  });
  assert.equal(rest.map((link) => link.key).join(","), "concept:m1");
});

test("ascii concepts match whole words only", () => {
  const concepts = [{ id: "m", key: "entropy", value: "混乱度", bookId: "a" }];
  assert.equal(findCrossBookLinks({ text: "negentropyx", currentBookId: "self", books, concepts }).length, 0);
  assert.equal(findCrossBookLinks({ text: "关于 Entropy 的讨论", currentBookId: "self", books, concepts }).length, 1);
});

test("crossBookLine wording", () => {
  assert.match(crossBookLine({ kind: "book", key: "k", bookId: "a", title: "人类简史", progress: 0.37 }), /37%/);
  assert.match(crossBookLine({ kind: "book", key: "k", bookId: "c", title: "GEB", status: "completed" }), /读完/);
  assert.match(crossBookLine({ kind: "book", key: "k", bookId: "b", title: "时间", progress: 0 }), /还没开始/);
  assert.match(
    crossBookLine({ kind: "concept", key: "k", bookId: "c", title: "GEB", concept: "涌现", value: "v" }),
    /「涌现」.*《GEB》/,
  );
});

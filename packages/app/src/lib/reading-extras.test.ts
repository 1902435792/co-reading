import assert from "node:assert/strict";
import test from "node:test";
import { clipChapterSoFar, formatToc } from "./reading-extras.ts";

test("目录压成两层缩进并标出当前章节", () => {
  const text = formatToc(
    [
      { label: "第一章", subitems: [{ label: "1.1", subitems: [{ label: "太深不列" }] }] },
      { label: "第二章" },
    ],
    "第二章",
  );
  assert.equal(text, "- 第一章\n  - 1.1\n- 第二章  ← 主人正在读");
});

test("目录太长时截断并说明总数", () => {
  const toc = Array.from({ length: 5 }, (_, i) => ({ label: `章${i}` }));
  const text = formatToc(toc, undefined, 3);
  assert.match(text, /共 5 项，只列出前 3 项/);
});

test("本章已读文字太长时保留最近部分", () => {
  const clipped = clipChapterSoFar("甲".repeat(50) + "乙".repeat(10), 10);
  assert.ok(clipped.endsWith("乙".repeat(10)));
  assert.match(clipped, /只保留最近的 10 字/);
  assert.equal(clipChapterSoFar("短文"), "短文");
});

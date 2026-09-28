import assert from "node:assert/strict";
import test from "node:test";
import { readerMinWidth, sidebarBounds } from "./sidebar-width.ts";

test("平板竖屏两栏都开：两栏最大宽度加正文最小宽度不超过屏幕", () => {
  for (const width of [600, 760, 800, 900, 1000]) {
    const { notepad, chat } = sidebarBounds(width, true, true);
    assert.ok(notepad.max + chat.max <= width - readerMinWidth(width) + 1, `width ${width}`);
    assert.ok(notepad.min <= notepad.max && chat.min <= chat.max);
  }
});

test("空间宽裕时保持原有范围", () => {
  const { notepad, chat } = sidebarBounds(1920, true, true);
  assert.deepEqual(notepad, { min: 260, max: 500 });
  assert.deepEqual(chat, { min: 320, max: 580 });
});

test("只开一栏时这一栏可以用满预算", () => {
  const { chat } = sidebarBounds(800, false, true);
  assert.equal(chat.max, 800 - readerMinWidth(800));
});

test("宽度未知时不限制", () => {
  assert.deepEqual(sidebarBounds(0, true, true).chat, { min: 320, max: 580 });
});

import assert from "node:assert/strict";
import test from "node:test";
import type { BookNote } from "../types/book.ts";
import {
  clearAnnotationHistory,
  isEditableTarget,
  pushRedo,
  pushUndo,
  recordAnnotationChange,
  takeRedo,
  takeUndo,
  undoKeyAction,
} from "./annotation-history.ts";

const note = (id: string): BookNote => ({
  id,
  type: "annotation",
  cfi: `epubcfi(/6/2!/4/${id})`,
  note: "",
  createdAt: 1,
  updatedAt: 1,
});

test("撤销 / 重做栈：新操作清空重做", () => {
  const book = "book-history";
  clearAnnotationHistory(book);
  recordAnnotationChange(book, { kind: "create", note: note("a") });
  recordAnnotationChange(book, { kind: "delete", note: note("b") });
  const last = takeUndo(book);
  assert.equal(last?.note.id, "b");
  pushRedo(book, last!);
  const redo = takeRedo(book);
  assert.equal(redo?.note.id, "b");
  pushUndo(book, redo!);
  pushRedo(book, { kind: "create", note: note("x") });
  recordAnnotationChange(book, { kind: "create", note: note("c") });
  assert.equal(takeRedo(book), undefined);
  assert.equal(takeUndo(book)?.note.id, "c");
});

test("快捷键识别与输入框放行", () => {
  const base = { ctrlKey: true, metaKey: false, shiftKey: false, altKey: false };
  assert.equal(undoKeyAction({ ...base, key: "z" }), "undo");
  assert.equal(undoKeyAction({ ...base, key: "Z", shiftKey: true }), "redo");
  assert.equal(undoKeyAction({ ...base, key: "y" }), "redo");
  assert.equal(undoKeyAction({ ...base, ctrlKey: false, key: "z" }), null);
  assert.equal(isEditableTarget({ tagName: "TEXTAREA" } as unknown as EventTarget), true);
  assert.equal(isEditableTarget({ tagName: "DIV", isContentEditable: false } as unknown as EventTarget), false);
});

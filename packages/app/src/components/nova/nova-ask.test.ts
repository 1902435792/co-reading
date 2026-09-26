import assert from "node:assert/strict";
import test from "node:test";
import { buildNovaAskPrompt, cleanNovaAnswer, clipNovaAskText, NOVA_ASK_ACTIONS, NOVA_ASK_MENU } from "./nova-ask.ts";

test("menu actions all have labels", () => {
  assert.deepEqual(NOVA_ASK_MENU, ["explain", "challenge", "connect", "summary"]);
  for (const action of NOVA_ASK_MENU) assert.ok(NOVA_ASK_ACTIONS[action].label.length > 0);
});

test("buildNovaAskPrompt includes book, section, text and task", () => {
  const { system, prompt } = buildNovaAskPrompt({
    action: "challenge",
    text: "所有系统都趋向平衡。",
    bookTitle: "系统之美",
    sectionLabel: "第一章",
  });
  assert.match(system, /《系统之美》/);
  assert.match(prompt, /^章节：第一章/);
  assert.match(prompt, /"""所有系统都趋向平衡。"""/);
  assert.match(prompt, /任务：站在反方/);
});

test("buildNovaAskPrompt works without book metadata", () => {
  const { system, prompt } = buildNovaAskPrompt({ action: "explain", text: "abc" });
  assert.match(system, /这本书/);
  assert.match(prompt, /^读者选中的文字：/);
});

test("clipNovaAskText trims long selections", () => {
  assert.equal(clipNovaAskText("  hello  "), "hello");
  const clipped = clipNovaAskText("a".repeat(20), 10);
  assert.equal(clipped.length, 10);
  assert.ok(clipped.endsWith("…"));
});

test("cleanNovaAnswer strips markdown marks", () => {
  assert.equal(cleanNovaAnswer("## 标题\n- **重点**在这里\n\n\n\n结束"), "标题\n重点在这里\n\n结束");
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_ANNOTATION_PREFS,
  READING_BACKGROUNDS,
  applyReadingBg,
  buildReadingBgCss,
  clampLayoutValue,
  formatLayoutValue,
  getReadingBgId,
  parseAnnotationPrefs,
  resolveAnnotationColor,
} from "./reading-page.ts";

test("背景片段可替换，保留用户其他样式", () => {
  const first = applyReadingBg("p{color:red}", "xuan");
  assert.equal(getReadingBgId(first), "xuan");
  assert.match(first, /^p\{color:red\}/);
  assert.match(first, /background-image:url\("data:image\/svg\+xml,/);
  const second = applyReadingBg(first, "warm-yellow");
  assert.equal(getReadingBgId(second), "warm-yellow");
  assert.equal((second.match(/deepreader-bg:/g) ?? []).length, 1);
  assert.match(second, /background-image:none/);
  assert.equal(applyReadingBg(second, "default"), "p{color:red}");
});

test("每个纸质背景都能生成样式，且不含会截断注释的 */", () => {
  for (const preset of READING_BACKGROUNDS) {
    const css = buildReadingBgCss(preset);
    if (preset.id === "default") {
      assert.equal(css, "");
      continue;
    }
    const inner = css.replace(/^\/\*deepreader-bg:\S+\*\//, "").replace(/\/\*\/deepreader-bg\*\/$/, "");
    assert.ok(!inner.includes("*/"), preset.id);
  }
});

test("标注偏好解析和配色", () => {
  assert.deepEqual(parseAnnotationPrefs(null), DEFAULT_ANNOTATION_PREFS);
  assert.deepEqual(parseAnnotationPrefs("{bad"), DEFAULT_ANNOTATION_PREFS);
  const prefs = parseAnnotationPrefs(
    JSON.stringify({ underlineStyle: "wavy", palette: "vivid", highlightStrength: "x" }),
  );
  assert.equal(prefs.underlineStyle, "wavy");
  assert.equal(prefs.highlightStrength, "soft");
  const vivid = { red: "#f87171" };
  assert.equal(resolveAnnotationColor("red", prefs, vivid), "#f87171");
  assert.equal(resolveAnnotationColor("red", DEFAULT_ANNOTATION_PREFS, vivid), "#e8a0a0");
  assert.equal(resolveAnnotationColor("#123456", DEFAULT_ANNOTATION_PREFS, vivid), "#123456");
});

test("排版数值吸附到步长并限制范围", () => {
  assert.equal(clampLayoutValue("lineHeight", 1.87), 1.9);
  assert.equal(clampLayoutValue("lineHeight", 9), 2.6);
  assert.equal(clampLayoutValue("readingWidth", 733), 740);
  assert.equal(formatLayoutValue("readingWidth", 0), "自动");
  assert.equal(formatLayoutValue("paragraphMargin", 1.25), "1.25em");
});

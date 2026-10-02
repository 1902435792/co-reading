import assert from "node:assert/strict";
import test from "node:test";
import {
  bridgeBaseModels,
  bridgeModelIdFor,
  bridgeModelName,
  composeBridgeModelId,
  missingBridgePresets,
  purposeProfilesFor,
  splitBridgeModelId,
} from "./vcp-bridge-models.ts";

test("split and compose Bridge model ids", () => {
  assert.equal(splitBridgeModelId("coreading-lite/gemini-3.8-flash-high").profile, "coreading-lite");
  assert.equal(splitBridgeModelId("gemini-3.8-flash").profile, "");
  assert.equal(splitBridgeModelId("/odd").model, "/odd");
  assert.equal(composeBridgeModelId("memory-extract", "gemini-3.8-flash"), "memory-extract/gemini-3.8-flash");
  assert.equal(composeBridgeModelId("reading", "coreading/gemini-3.5-flash"), "reading/gemini-3.5-flash");
  assert.equal(composeBridgeModelId("", "nova/gemini-3.5-flash"), "gemini-3.5-flash");
});

test("base models come from existing ids or fall back", () => {
  assert.equal(bridgeBaseModels([]).length, 3);
  assert.equal(bridgeBaseModels(["coreading/gemini-x", "gemini-x", "gemini-y"]).join(","), "gemini-x,gemini-y");
});

test("names and presets", () => {
  assert.equal(bridgeModelName("coreading-lite", "gemini-3.8-flash-high"), "自动共读 · gemini-3.8-flash-high");
  assert.equal(bridgeModelName("snow", "gemini-3.5-flash"), "snow · gemini-3.5-flash");
  assert.equal(bridgeModelName("", "gemini-3.5-flash"), "gemini-3.5-flash");
  assert.equal(missingBridgePresets(["coreading-lite/gemini-3.8-flash-high"]).length, 1);
  assert.equal(missingBridgePresets([]).length, 2);
});

test("bridgeModelIdFor adds the purpose profile automatically", () => {
  assert.equal(bridgeModelIdFor("gemini-3.8-flash", "coreading"), "coreading-lite/gemini-3.8-flash");
  assert.equal(bridgeModelIdFor("gemini-3.8-flash", "reading"), "reading/gemini-3.8-flash");
  assert.equal(bridgeModelIdFor("gemini-3.8-flash", "memory"), "memory-extract/gemini-3.8-flash");
  assert.equal(bridgeModelIdFor("memory-extract/gemini-3.8-flash", "diary"), "gemini-3.8-flash");
  // 认识的前缀按用途替换。
  assert.equal(bridgeModelIdFor("memory-extract/gemini-3.8-flash", "reading"), "reading/gemini-3.8-flash");
  assert.equal(
    bridgeModelIdFor("coreading/gemini-3.8-flash-high", "coreading"),
    "coreading-lite/gemini-3.8-flash-high",
  );
  // 自定义前缀原样保留。
  assert.equal(bridgeModelIdFor("snow/gemini-3.8-flash", "reading"), "snow/gemini-3.8-flash");
});

test("bridgeModelIdFor fast drops -high", () => {
  assert.equal(
    bridgeModelIdFor("coreading-lite/gemini-3.8-flash-high", "coreading", { fast: true }),
    "coreading-lite/gemini-3.8-flash",
  );
  assert.equal(bridgeModelIdFor("gemini-3.8-flash", "coreading", { fast: true }), "coreading-lite/gemini-3.8-flash");
  assert.equal(bridgeModelIdFor("snow/x-high", "coreading", { fast: true }), "snow/x");
});

test("后台小请求走纯净 Profile，不注入人格", () => {
  assert.equal(bridgeModelIdFor("gemini-3.8-flash-high", "plain"), "deepreader-plain/gemini-3.8-flash-high");
  assert.equal(bridgeModelIdFor("reading/gemini-3.8-flash", "plain"), "deepreader-plain/gemini-3.8-flash");
});

test("向导配置的提供商改用 deepreader-* 这套 Profile", () => {
  const set = { profileSet: "deepreader" as const };
  assert.equal(bridgeModelIdFor("gemini-3.8-flash", "coreading", set), "deepreader-coreading/gemini-3.8-flash");
  assert.equal(bridgeModelIdFor("gemini-3.8-flash", "memory", set), "deepreader-memory/gemini-3.8-flash");
  assert.equal(bridgeModelIdFor("gemini-3.8-flash", "plain", set), "deepreader-plain/gemini-3.8-flash");
  // 问答不加前缀：用对方 VCP 的默认角色。
  assert.equal(bridgeModelIdFor("gemini-3.8-flash", "reading", set), "gemini-3.8-flash");
  assert.equal(bridgeModelIdFor("reading/gemini-3.8-flash", "reading", set), "gemini-3.8-flash");
  assert.equal(bridgeModelIdFor("gemini-3.8-flash", "diary", set), "gemini-3.8-flash");
  // 原来那套的前缀会被换掉；自定义前缀照旧保留。
  assert.equal(
    bridgeModelIdFor("coreading-lite/gemini-3.8-flash-high", "coreading", set),
    "deepreader-coreading/gemini-3.8-flash-high",
  );
  assert.equal(bridgeModelIdFor("snow/gemini-3.8-flash", "coreading", set), "snow/gemini-3.8-flash");
  assert.equal(
    bridgeModelIdFor("deepreader-coreading/x-high", "coreading", { ...set, fast: true }),
    "deepreader-coreading/x",
  );
});

test("不填 profileSet 时行为和以前完全一样", () => {
  for (const purpose of ["coreading", "reading", "memory", "diary", "plain"] as const) {
    assert.equal(
      bridgeModelIdFor("gemini-3.8-flash", purpose, { profileSet: "classic" }),
      bridgeModelIdFor("gemini-3.8-flash", purpose),
    );
  }
  assert.deepEqual(purposeProfilesFor(undefined), purposeProfilesFor("classic"));
  // deepreader-* 前缀在原来那套里也会被换回去（向导配置过又改回来的情况）。
  assert.equal(
    bridgeModelIdFor("deepreader-coreading/gemini-3.8-flash", "coreading"),
    "coreading-lite/gemini-3.8-flash",
  );
});

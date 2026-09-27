import assert from "node:assert/strict";
import test from "node:test";
import {
  bridgeBaseModels,
  bridgeModelName,
  composeBridgeModelId,
  missingBridgePresets,
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

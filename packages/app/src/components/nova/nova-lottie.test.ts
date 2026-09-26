import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NOVA_CANVAS_SIZE, NOVA_MOODS, NOVA_ONE_SHOT_MOODS, buildNovaAnimation } from "./nova-lottie";
import { NOVA_SLEEP_AFTER_MS, deriveNovaMood, getAnnotationReaction, pickNovaLine, shortenNovaText } from "./nova-mood";

interface Keyframe {
  t: number;
  s: number[];
}

function collectKeyframes(value: unknown, out: Keyframe[] = []): Keyframe[] {
  if (Array.isArray(value)) {
    for (const item of value) collectKeyframes(item, out);
  } else if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (record.a === 1 && Array.isArray(record.k)) {
      out.push(...(record.k as Keyframe[]));
    }
    for (const item of Object.values(record)) collectKeyframes(item, out);
  }
  return out;
}

describe("buildNovaAnimation", () => {
  for (const mood of NOVA_MOODS) {
    it(`builds a valid ${mood} animation`, () => {
      const data = buildNovaAnimation(mood, "/assets/nova-test.webp");
      assert.equal(data.w, NOVA_CANVAS_SIZE);
      assert.ok(data.op > 0);
      assert.equal(data.assets[0]?.p, "/assets/nova-test.webp");
      assert.equal(data.assets[0]?.e, 1);

      const indices = data.layers.map((layer) => layer.ind);
      assert.equal(new Set(indices).size, indices.length, "unique layer ind");
      const image = data.layers.filter((layer) => layer.ty === 2);
      assert.equal(image.length, 1);
      assert.equal(image[0]?.refId, "nova_img");
      for (const layer of data.layers) {
        if (layer.parent != null) assert.ok(indices.includes(layer.parent));
        if (layer.ty === 4) assert.ok((layer.shapes?.length ?? 0) > 0);
      }

      const keyframes = collectKeyframes(data.layers);
      assert.ok(keyframes.length > 0, "has motion");
      for (const frame of keyframes) {
        assert.ok(frame.t >= 0 && frame.t <= data.op, `frame ${frame.t}`);
        assert.ok(frame.s.every(Number.isFinite));
      }
      assert.doesNotThrow(() => JSON.parse(JSON.stringify(data)));
    });
  }

  it("marks greet and pet as one-shot", () => {
    assert.ok(NOVA_ONE_SHOT_MOODS.has("greet"));
    assert.ok(NOVA_ONE_SHOT_MOODS.has("pet"));
    assert.ok(!NOVA_ONE_SHOT_MOODS.has("idle"));
  });
});

describe("deriveNovaMood", () => {
  const base = {
    status: "active" as const,
    isProcessing: false,
    error: null,
    idleMs: 0,
    reaction: null,
  };

  it("prefers a transient reaction", () => {
    assert.equal(deriveNovaMood({ ...base, error: "x", reaction: "pet" }), "pet");
  });
  it("maps runtime state", () => {
    assert.equal(deriveNovaMood({ ...base, error: "boom" }), "error");
    assert.equal(deriveNovaMood({ ...base, status: "paused" }), "paused");
    assert.equal(deriveNovaMood({ ...base, isProcessing: true }), "thinking");
    assert.equal(deriveNovaMood({ ...base, idleMs: NOVA_SLEEP_AFTER_MS }), "sleep");
    assert.equal(deriveNovaMood(base), "idle");
  });
  it("does not sleep while processing", () => {
    assert.equal(
      deriveNovaMood({
        ...base,
        isProcessing: true,
        idleMs: NOVA_SLEEP_AFTER_MS * 2,
      }),
      "thinking",
    );
  });
});

describe("nova lines", () => {
  it("fills template variables", () => {
    assert.equal(pickNovaLine("greet", 0, { title: "类型与原型" }), "一起读《类型与原型》吧！");
  });
  it("chooses reactions by note length", () => {
    assert.equal(getAnnotationReaction("短评"), "talking");
    assert.equal(getAnnotationReaction("长".repeat(80)), "found");
  });
  it("shortens long text", () => {
    assert.equal(shortenNovaText("a  b"), "a b");
    assert.equal(shortenNovaText("x".repeat(200), 10).length, 10);
  });
});

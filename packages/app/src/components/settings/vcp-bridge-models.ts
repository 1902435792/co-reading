// VCP Bridge 模型 ID 的快捷填写：Bridge 按「Profile/模型」的前缀选 Profile。
// 纯逻辑，不依赖 React、Tauri 或 "@/…" 路径，方便单元测试。

export interface VcpBridgeProfileOption {
  id: string;
  label: string;
  hint: string;
}

/** 常用 Profile（按推荐顺序）。其他 Profile 仍可以在模型 ID 里手动写前缀。 */
export const VCP_BRIDGE_PROFILES: readonly VcpBridgeProfileOption[] = [
  { id: "coreading-lite", label: "自动共读", hint: "推荐：只召回阅读日记，不写 OneRing" },
  { id: "memory-extract", label: "记忆提取", hint: "纯净：不注入任何 VCP 内容" },
  { id: "reading", label: "阅读 Agent", hint: "问答和侧栏对话；会接入 OneRing" },
  { id: "nova", label: "Nova 对话", hint: "完整 Nova 人格和工具箱；会接入 OneRing" },
];

/** 还没点「获取模型」时可选的基础模型（Bridge 配置里的 availableModels）。 */
export const VCP_BRIDGE_FALLBACK_MODELS: readonly string[] = [
  "gemini-3.8-flash-high",
  "gemini-3.8-flash",
  "gemini-3.5-flash",
];

/** 一键添加的推荐组合：都是不会写 OneRing 的干净 Profile。 */
export const VCP_BRIDGE_PRESETS: readonly { id: string; name: string }[] = [
  { id: "coreading-lite/gemini-3.8-flash-high", name: "自动共读 · gemini-3.8-flash-high" },
  { id: "memory-extract/gemini-3.8-flash", name: "记忆提取 · gemini-3.8-flash" },
];

export function splitBridgeModelId(id: string): { profile: string; model: string } {
  const trimmed = id.trim();
  const slash = trimmed.indexOf("/");
  if (slash <= 0) return { profile: "", model: trimmed };
  return { profile: trimmed.slice(0, slash), model: trimmed.slice(slash + 1) };
}

export function composeBridgeModelId(profile: string, model: string): string {
  const base = splitBridgeModelId(model).model || model.trim();
  return profile.trim() ? `${profile.trim()}/${base}` : base;
}

/** 从提供商已有的模型里取出不带前缀的基础模型；一个都没有时用内置列表。 */
export function bridgeBaseModels(modelIds: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const id of modelIds) {
    const { model } = splitBridgeModelId(id);
    if (model) seen.add(model);
  }
  return seen.size > 0 ? [...seen] : [...VCP_BRIDGE_FALLBACK_MODELS];
}

export function bridgeModelName(profile: string, model: string): string {
  const option = VCP_BRIDGE_PROFILES.find((item) => item.id === profile);
  const base = splitBridgeModelId(model).model || model;
  if (!profile) return base;
  return `${option?.label ?? profile} · ${base}`;
}

/** 还没添加过的推荐组合。 */
export function missingBridgePresets(existingIds: readonly string[]): { id: string; name: string }[] {
  const existing = new Set(existingIds.map((id) => id.trim()));
  return VCP_BRIDGE_PRESETS.filter((preset) => !existing.has(preset.id));
}

// ---------- 按用途自动加 Profile 前缀（用户只需要选基础模型） ----------

export type BridgePurpose = "coreading" | "reading" | "memory" | "diary";

/** 每个用途默认走的 Profile；日记直接用基础模型名（Bridge 的日记接口自己带 Profile）。 */
export const BRIDGE_PURPOSE_PROFILE: Record<BridgePurpose, string> = {
  coreading: "coreading-lite",
  reading: "reading",
  memory: "memory-extract",
  diary: "",
};

/** 程序认识的 Profile：这些前缀会被按用途替换；别的前缀当作用户自定义，原样保留。 */
const KNOWN_PROFILES = new Set([...VCP_BRIDGE_PROFILES.map((item) => item.id), "coreading"]);

/**
 * 把设置里选的模型换成这个用途真正要发给 Bridge 的模型 ID。
 * - 没前缀或是认识的前缀：换成用途对应的 Profile；
 * - 自定义前缀：保留；
 * - fast：去掉末尾的 -high（不深度思考，快很多）。
 */
export function bridgeModelIdFor(modelId: string, purpose: BridgePurpose, options: { fast?: boolean } = {}): string {
  const { profile, model } = splitBridgeModelId(modelId);
  const base = options.fast ? model.replace(/-high$/u, "") || model : model;
  if (profile && !KNOWN_PROFILES.has(profile)) return `${profile}/${base}`;
  return composeBridgeModelId(BRIDGE_PURPOSE_PROFILE[purpose], base);
}

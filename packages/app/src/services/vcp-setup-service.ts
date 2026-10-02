// VCP 一键配置向导：读写 VCPToolBox 里的文件、检查 Bridge、建提供商。
// 纯逻辑在 lib/vcp-setup.ts；这里只做 Tauri 调用和状态写入。
import coreadingTemplate from "@/assets/vcp-pack/deepreader-coreading.txt?raw";
import diaryTemplate from "@/assets/vcp-pack/deepreader-coreading-diary.txt?raw";
import memoryTemplate from "@/assets/vcp-pack/deepreader-memory.txt?raw";
import { bridgeBaseModels } from "@/components/settings/vcp-bridge-models";
import {
  VCP_BRIDGE_DIR,
  type VcpPackFile,
  type VcpSetupVars,
  type VcpWritePlan,
  buildVcpPackFiles,
  joinVcpPath,
  planVcpWrite,
  resolveVcpBridgeConfig,
  vcpExportReadme,
  vcpPackDirs,
} from "@/lib/vcp-setup";
import { useProviderStore } from "@/store/provider-store";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { exists, mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { fetch as fetchTauri } from "@tauri-apps/plugin-http";
import { type as getOsType } from "@tauri-apps/plugin-os";

export const VCP_PACK_TEMPLATES = { coreading: coreadingTemplate, memory: memoryTemplate, diary: diaryTemplate };

export function isAndroidPlatform(): boolean {
  try {
    return getOsType() === "android";
  } catch {
    return false;
  }
}

/** 选文件夹。recursive: true 让选中的文件夹（含子目录）进入 fs 允许范围，不用放宽全局权限。 */
export async function pickFolder(title: string): Promise<string | null> {
  const result = await openDialog({ directory: true, multiple: false, recursive: true, title });
  return typeof result === "string" && result.trim() ? result : null;
}

export interface VcpFolderInspection {
  /** 实际的 VCPToolBox 根目录（用户选了上一级时会自动进入 VCPToolBox）。 */
  root: string;
  files: VcpPackFile[];
  plan: VcpWritePlan;
  /** 还不存在、写入时要新建的文件夹（相对路径）。 */
  missingDirs: string[];
}

async function existsSafe(path: string): Promise<boolean> {
  try {
    return await exists(path);
  } catch {
    return false;
  }
}

/** 找到 Plugin/VCPBridgeServer，算出哪些文件要新增、哪些已存在要跳过。找不到返回 null。 */
export async function inspectVcpFolder(picked: string, vars: VcpSetupVars): Promise<VcpFolderInspection | null> {
  const candidates = [picked, joinVcpPath(picked, "VCPToolBox")];
  let root: string | null = null;
  for (const candidate of candidates) {
    if (await existsSafe(joinVcpPath(candidate, VCP_BRIDGE_DIR))) {
      root = candidate;
      break;
    }
  }
  if (!root) return null;
  const files = buildVcpPackFiles(VCP_PACK_TEMPLATES, vars);
  const existing = new Set<string>();
  for (const file of files) {
    if (await existsSafe(joinVcpPath(root, file.relPath))) existing.add(file.relPath);
  }
  const missingDirs: string[] = [];
  for (const dir of vcpPackDirs(vars)) {
    if (!(await existsSafe(joinVcpPath(root, dir)))) missingDirs.push(dir);
  }
  return { root, files, plan: planVcpWrite(files, existing), missingDirs };
}

export interface VcpWriteResult {
  written: string[];
  skipped: string[];
  createdDirs: string[];
  failed: { relPath: string; message: string }[];
}

/**
 * 只新增，不覆盖：写之前再查一次，期间冒出来的同名文件也跳过。
 * 先建文件夹（含 dailynote/日记本），再逐个写文件；单个失败不影响其他。
 */
export async function writeVcpFiles(
  root: string,
  files: readonly VcpPackFile[],
  dirs: readonly string[],
): Promise<VcpWriteResult> {
  const result: VcpWriteResult = { written: [], skipped: [], createdDirs: [], failed: [] };
  for (const dir of dirs) {
    const full = joinVcpPath(root, dir);
    if (await existsSafe(full)) continue;
    try {
      await mkdir(full, { recursive: true });
      result.createdDirs.push(dir);
    } catch (error) {
      result.failed.push({ relPath: `${dir}/`, message: error instanceof Error ? error.message : String(error) });
    }
  }
  for (const file of files) {
    const full = joinVcpPath(root, file.relPath);
    if (await existsSafe(full)) {
      result.skipped.push(file.relPath);
      continue;
    }
    try {
      await writeTextFile(full, file.content);
      result.written.push(file.relPath);
    } catch (error) {
      result.failed.push({ relPath: file.relPath, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return result;
}

/** 导出配置包：同样的目录结构 + 说明.txt，写到用户选的文件夹。 */
export async function exportVcpPack(target: string, vars: VcpSetupVars): Promise<VcpWriteResult> {
  const files = buildVcpPackFiles(VCP_PACK_TEMPLATES, vars);
  const readme: VcpPackFile = { relPath: "说明.txt", kind: "prompt", content: vcpExportReadme(vars) };
  return writeVcpFiles(target, [...files, readme], vcpPackDirs(vars));
}

async function readOptional(path: string): Promise<string | null> {
  try {
    return (await existsSafe(path)) ? await readTextFile(path) : null;
  } catch {
    return null;
  }
}

/** 读 Bridge 端口；includeKey 为 true 时才去读密钥（需要用户点按钮）。 */
export async function readVcpBridgeConfig(
  root: string,
  includeKey: boolean,
): Promise<{ port: number; key: string | null }> {
  const bridgeDir = joinVcpPath(root, VCP_BRIDGE_DIR);
  const resolved = resolveVcpBridgeConfig({
    bridgeConfigJson: await readOptional(joinVcpPath(bridgeDir, "bridge-config.json")),
    bridgeEnv: await readOptional(joinVcpPath(bridgeDir, "config.env")),
    rootEnv: includeKey ? await readOptional(joinVcpPath(root, "config.env")) : null,
  });
  return includeKey ? resolved : { port: resolved.port, key: null };
}

export function bridgeOrigin(baseUrl: string): string | null {
  try {
    return new URL(baseUrl.trim()).origin;
  } catch {
    return null;
  }
}

export type BridgeProbe =
  | { ok: true; models: string[]; modelsError?: string }
  | { ok: false; stage: "offline" | "auth" | "error"; message: string };

/** 先查 /health（不要密钥），再用密钥取模型列表；取不到模型不算失败，改成手动填。 */
export async function probeBridge(baseUrl: string, apiKey: string): Promise<BridgeProbe> {
  const origin = bridgeOrigin(baseUrl);
  if (!origin) return { ok: false, stage: "error", message: "Bridge 地址格式不对，应类似 http://127.0.0.1:3100/v1" };
  try {
    const health = await fetchTauri(`${origin}/health`, { signal: AbortSignal.timeout(8_000) });
    if (!health.ok) return { ok: false, stage: "offline", message: `Bridge 返回 HTTP ${health.status}` };
  } catch {
    return { ok: false, stage: "offline", message: "连不上 Bridge：请确认 VCP 已经启动" };
  }
  try {
    const response = await fetchTauri(`${baseUrl.trim().replace(/\/+$/u, "")}/models`, {
      headers: { Authorization: `Bearer ${apiKey.trim()}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 401 || response.status === 403) {
      return { ok: false, stage: "auth", message: "密钥不对：Bridge 拒绝了请求（HTTP 401）" };
    }
    if (!response.ok)
      return { ok: true, models: [], modelsError: `取模型列表失败（HTTP ${response.status}），请手动填模型名` };
    const body = (await response.json().catch(() => null)) as { data?: { id?: unknown }[] } | null;
    const ids = (body?.data ?? []).map((item) => (typeof item.id === "string" ? item.id : "")).filter(Boolean);
    return ids.length > 0
      ? { ok: true, models: bridgeBaseModels(ids).slice(0, 60) }
      : { ok: true, models: [], modelsError: "Bridge 没有返回模型列表，请手动填模型名" };
  } catch (error) {
    return {
      ok: true,
      models: [],
      modelsError: `取模型列表失败：${error instanceof Error ? error.message : String(error)}，请手动填模型名`,
    };
  }
}

export interface ApplyProviderResult {
  providerId: string;
  created: boolean;
  modelCount: number;
}

/**
 * 建（或更新）向导专用的 Bridge 提供商，用 deepreader-* 这套 Profile。
 * 只会更新以前向导建的那个；用户自己配的提供商（哪怕地址相同）一概不动，另建一个。
 * 问答模型、记忆模型只在还没选的时候帮着选上。
 */
export function applyVcpProvider(input: { baseUrl: string; apiKey: string; models: string[] }): ApplyProviderResult {
  const store = useProviderStore.getState();
  const baseUrl = input.baseUrl.trim().replace(/\/+$/u, "");
  const models: Model[] = input.models.map((id) => ({ id, name: id, active: true, manual: true }));
  const existing = store.modelProviders.find((provider) => provider.vcpProfileSet === "deepreader");
  let providerId: string;
  let created = false;
  if (existing) {
    providerId = existing.provider;
    const merged = [...existing.models];
    for (const model of models) if (!merged.some((item) => item.id === model.id)) merged.push(model);
    store.updateProvider(providerId, {
      baseUrl,
      apiKey: input.apiKey.trim(),
      active: true,
      vcpBridge: true,
      models: merged,
    });
  } else {
    providerId = store.addProvider();
    created = true;
    store.updateProvider(providerId, {
      name: "VCP Bridge（一键配置）",
      baseUrl,
      apiKey: input.apiKey.trim(),
      active: true,
      vcpBridge: true,
      vcpProfileSet: "deepreader",
      models,
    });
  }
  const provider = useProviderStore.getState().modelProviders.find((item) => item.provider === providerId);
  const activeModels = (provider?.models ?? []).filter((model) => model.active !== false);
  const pick = (model: Model) => ({
    modelId: model.id,
    providerId,
    providerName: provider?.name ?? "VCP Bridge",
    modelName: model.name || model.id,
  });
  const state = useProviderStore.getState();
  if (!state.selectedModel && activeModels[0]) state.setSelectedModel(pick(activeModels[0]));
  if (!state.memoryExtractionModel && activeModels[0]) {
    // 记忆提取不需要深度思考：优先选不带 -high 的。
    const fast = activeModels.find((model) => !/-high$/u.test(model.id)) ?? activeModels[0];
    state.setMemoryExtractionModel(pick(fast));
  }
  return { providerId, created, modelCount: activeModels.length };
}

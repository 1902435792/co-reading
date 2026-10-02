// VCP 一键配置向导的纯逻辑：变量替换、要写哪些文件、读 Bridge 端口和密钥。
// 不依赖 React、Tauri 或 "@/…" 路径，方便单元测试。

/** Bridge 插件在 VCPToolBox 里的位置。 */
export const VCP_BRIDGE_DIR = "Plugin/VCPBridgeServer";
export const VCP_BRIDGE_DEFAULT_PORT = 3100;

export interface VcpSetupVars {
  /** 对方 VCP 里的角色名（日记的 maid）。 */
  agentName: string;
  /** 角色怎么称呼读者。 */
  readerCall: string;
  /** 阅读日记本的名字，也是 dailynote 下的文件夹名。 */
  diaryName: string;
}

export const DEFAULT_VCP_SETUP_VARS: VcpSetupVars = {
  agentName: "Nova",
  readerCall: "你",
  diaryName: "阅读器",
};

/** 随安装包内置的提示词模板（向导服务用 ?raw 读进来）。 */
export interface VcpPackTemplates {
  coreading: string;
  memory: string;
  diary: string;
}

export interface VcpPackFile {
  /** 相对 VCPToolBox 根目录的路径，统一用 /。 */
  relPath: string;
  kind: "profile" | "prompt";
  content: string;
}

// Windows 文件名不允许的字符，以及会被当成路径的写法。
const UNSAFE_NAME = /[\\/:*?"<>|]/u;
const hasControlChar = (value: string) => [...value].some((char) => (char.codePointAt(0) ?? 0) < 0x20);

/** 去掉首尾空白、填默认值，并检查能不能当文件夹名用。 */
export function normalizeVcpSetupVars(input: Partial<VcpSetupVars>): { vars: VcpSetupVars; errors: string[] } {
  const pick = (value: string | undefined, fallback: string) => (value ?? "").trim() || fallback;
  const vars: VcpSetupVars = {
    agentName: pick(input.agentName, DEFAULT_VCP_SETUP_VARS.agentName),
    readerCall: pick(input.readerCall, DEFAULT_VCP_SETUP_VARS.readerCall),
    diaryName: pick(input.diaryName, DEFAULT_VCP_SETUP_VARS.diaryName),
  };
  const errors: string[] = [];
  if (
    UNSAFE_NAME.test(vars.diaryName) ||
    hasControlChar(vars.diaryName) ||
    vars.diaryName === "." ||
    vars.diaryName === ".."
  ) {
    errors.push('日记本名字不能包含 \\ / : * ? " < > | 这些字符');
  }
  if (/[.\s]$/u.test(vars.diaryName)) errors.push("日记本名字不能以点或空格结尾");
  if (vars.diaryName.length > 40) errors.push("日记本名字最多 40 个字");
  for (const [label, value] of [
    ["角色名", vars.agentName],
    ["称呼", vars.readerCall],
  ] as const) {
    if (/[\r\n{}]/u.test(value)) errors.push(`${label}不能包含换行或花括号`);
    if (value.length > 40) errors.push(`${label}最多 40 个字`);
  }
  return { vars, errors };
}

/** 只替换向导的三个变量；VCP 自己的占位符（如 {{VarDailyNoteGuide}}）原样保留。 */
export function renderVcpTemplate(template: string, vars: VcpSetupVars): string {
  return template
    .split("{{AGENT_NAME}}")
    .join(vars.agentName)
    .split("{{READER_CALL}}")
    .join(vars.readerCall)
    .split("{{DIARY_NAME}}")
    .join(vars.diaryName);
}

const PROFILES_DIR = `${VCP_BRIDGE_DIR}/profiles`;
const PROMPTS_DIR = `${VCP_BRIDGE_DIR}/prompts`;

function profileJson(profile: Record<string, string | number>): string {
  return `${JSON.stringify(profile, null, 2)}\n`;
}

/** 生成要写进 VCPToolBox 的全部文件（4 个 Profile + 3 个提示词）。 */
export function buildVcpPackFiles(templates: VcpPackTemplates, vars: VcpSetupVars): VcpPackFile[] {
  const note = "由 DeepReader 一键配置向导写入。";
  return [
    {
      relPath: `${PROFILES_DIR}/deepreader-coreading.json`,
      kind: "profile",
      content: profileJson({
        name: "deepreader-coreading",
        displayName: "DeepReader 自动共读",
        systemPrompt: "prompts/deepreader-coreading.txt",
        hijackMode: "prepend",
        modelOverride: "",
        responseMode: "passthrough",
        promptCacheTtlSec: 600,
        description: `DeepReader 自动共读：只检索${vars.diaryName}日记本，不注入日记写入指南。${note}`,
      }),
    },
    {
      relPath: `${PROFILES_DIR}/deepreader-memory.json`,
      kind: "profile",
      content: profileJson({
        name: "deepreader-memory",
        displayName: "DeepReader 记忆提取",
        systemPrompt: "prompts/deepreader-memory.txt",
        hijackMode: "prepend",
        modelOverride: "",
        responseMode: "passthrough",
        description: `DeepReader 后台记忆提取：只加一段 JSON 输出约束，不注入任何 VCP 内容。${note}`,
      }),
    },
    {
      relPath: `${PROFILES_DIR}/deepreader-plain.json`,
      kind: "profile",
      content: profileJson({
        name: "deepreader-plain",
        displayName: "DeepReader 后台小请求",
        // 不能留空：留空会回退到全局提示词。hijackMode=off 时这段文字不会发给模型。
        systemPrompt: "[deepreader-plain: no injection]",
        hijackMode: "off",
        modelOverride: "",
        responseMode: "passthrough",
        description: `DeepReader 的后台小请求（整理对话上下文、自动打标签）：不注入人格、日记或工具箱。${note}`,
      }),
    },
    {
      relPath: `${PROFILES_DIR}/deepreader-coreading-diary.json`,
      kind: "profile",
      content: profileJson({
        name: "deepreader-coreading-diary",
        displayName: "DeepReader 阅读日记",
        systemPrompt: "prompts/deepreader-coreading-diary.txt",
        hijackMode: "replace",
        modelOverride: "",
        responseMode: "passthrough",
        description: `DeepReader 用户手动触发的阅读日记，写入${vars.diaryName}日记本。${note}`,
      }),
    },
    {
      relPath: `${PROMPTS_DIR}/deepreader-coreading.txt`,
      kind: "prompt",
      content: renderVcpTemplate(templates.coreading, vars),
    },
    {
      relPath: `${PROMPTS_DIR}/deepreader-memory.txt`,
      kind: "prompt",
      content: renderVcpTemplate(templates.memory, vars),
    },
    {
      relPath: `${PROMPTS_DIR}/deepreader-coreading-diary.txt`,
      kind: "prompt",
      content: renderVcpTemplate(templates.diary, vars),
    },
  ];
}

/** 需要确保存在的文件夹（含日记本文件夹）。 */
export function vcpPackDirs(vars: VcpSetupVars): string[] {
  return [PROFILES_DIR, PROMPTS_DIR, `dailynote/${vars.diaryName}`];
}

export interface VcpWritePlan {
  create: VcpPackFile[];
  /** 同名文件已存在：一律跳过，不覆盖。 */
  skip: VcpPackFile[];
}

export function planVcpWrite(files: readonly VcpPackFile[], existing: ReadonlySet<string>): VcpWritePlan {
  const create: VcpPackFile[] = [];
  const skip: VcpPackFile[] = [];
  for (const file of files) (existing.has(file.relPath) ? skip : create).push(file);
  return { create, skip };
}

/** 拼路径：根目录可能是 Windows 反斜杠，相对部分统一用 /（Tauri 的 fs 两种都认）。 */
export function joinVcpPath(root: string, relPath: string): string {
  const base = root.replace(/[\\/]+$/u, "");
  const sep = base.includes("\\") && !base.includes("/") ? "\\" : "/";
  return `${base}${sep}${relPath.split("/").join(sep)}`;
}

/** 解析 .env 文本（KEY=VALUE，支持注释和引号）。 */
export function parseEnvText(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    const quoted = /^(["'])(.*)\1$/u.exec(value);
    if (quoted) value = quoted[2];
    else value = value.replace(/\s+#.*$/u, "").trim();
    result[key] = value;
  }
  return result;
}

function toPort(value: unknown): number | null {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 65535 ? parsed : null;
}

function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export interface VcpBridgeSources {
  /** Plugin/VCPBridgeServer/bridge-config.json 的文本（没有就 null）。 */
  bridgeConfigJson?: string | null;
  /** Plugin/VCPBridgeServer/config.env 的文本。 */
  bridgeEnv?: string | null;
  /** VCPToolBox 根目录 config.env 的文本（只在读密钥时用）。 */
  rootEnv?: string | null;
}

/**
 * 按 Bridge 自己的优先级算出端口和密钥：
 * bridge-config.json → 插件 config.env → 根目录 config.env 的 Key；端口默认 3100。
 */
export function resolveVcpBridgeConfig(sources: VcpBridgeSources): { port: number; key: string | null } {
  let json: Record<string, unknown> = {};
  if (sources.bridgeConfigJson) {
    try {
      const parsed = JSON.parse(sources.bridgeConfigJson) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) json = parsed as Record<string, unknown>;
    } catch {
      json = {};
    }
  }
  const bridgeEnv = sources.bridgeEnv ? parseEnvText(sources.bridgeEnv) : {};
  const rootEnv = sources.rootEnv ? parseEnvText(sources.rootEnv) : {};
  const port =
    toPort(json.port) ?? toPort(json.BRIDGE_PORT) ?? toPort(bridgeEnv.BRIDGE_PORT) ?? VCP_BRIDGE_DEFAULT_PORT;
  const key =
    nonEmpty(json.upstreamKey) ??
    nonEmpty(json.BRIDGE_UPSTREAM_KEY) ??
    nonEmpty(bridgeEnv.BRIDGE_UPSTREAM_KEY) ??
    nonEmpty(bridgeEnv.Key) ??
    nonEmpty(rootEnv.Key);
  return { port, key };
}

/** 导出配置包时附带的说明。 */
export function vcpExportReadme(vars: VcpSetupVars): string {
  return [
    "DeepReader × VCP 配置包",
    "========================",
    "",
    "把这个文件夹里的 Plugin 和 dailynote 两个文件夹复制到你的 VCPToolBox 根目录，合并进去即可。",
    "同名文件已存在时请保留你自己的版本（不要覆盖）。VCP Bridge 会自动热加载 Profile，不需要重启。",
    "",
    "包含：",
    "- Plugin/VCPBridgeServer/profiles/deepreader-*.json：4 个 Profile（自动共读、记忆提取、后台小请求、阅读日记）",
    "- Plugin/VCPBridgeServer/prompts/deepreader-*.txt：对应的提示词",
    `- dailynote/${vars.diaryName}/：阅读日记本文件夹`,
    "",
    `角色名：${vars.agentName}；称呼读者：${vars.readerCall}；日记本：${vars.diaryName}日记本`,
    "",
    "然后在 DeepReader：设置 → 共读 → 一键配置 VCP → 连接已配置好的 VCP，填两项：",
    "- Bridge 地址：http://<VCP 所在电脑>:3100/v1（端口以 Bridge 的 BRIDGE_PORT 为准）",
    "- 密钥：Bridge 的 BRIDGE_UPSTREAM_KEY（没设就用 VCP 的 Key）",
    "DeepReader 会建好提供商，并自动改用这套 deepreader-* Profile。",
    "",
  ].join("\n");
}

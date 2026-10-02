import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DEFAULT_VCP_SETUP_VARS, type VcpSetupVars, normalizeVcpSetupVars } from "@/lib/vcp-setup";
import {
  type VcpFolderInspection,
  type VcpWriteResult,
  applyVcpProvider,
  exportVcpPack,
  inspectVcpFolder,
  isAndroidPlatform,
  pickFolder,
  probeBridge,
  readVcpBridgeConfig,
  writeVcpFiles,
} from "@/services/vcp-setup-service";
import { CheckCircle2, CircleAlert, FolderOpen, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";

type Mode = "choose" | "local" | "export" | "connect";

function VarsForm({ vars, onChange }: { vars: VcpSetupVars; onChange: (vars: VcpSetupVars) => void }) {
  const fields: { key: keyof VcpSetupVars; label: string; hint: string }[] = [
    { key: "agentName", label: "角色名", hint: "你 VCP 里的 Agent 名字，日记会以它的身份写" },
    { key: "readerCall", label: "怎么称呼你", hint: "例如「你」「主人」" },
    { key: "diaryName", label: "日记本名字", hint: "会建 dailynote/这个名字/ 文件夹，日记本叫「名字日记本」" },
  ];
  return (
    <div className="space-y-2">
      {fields.map((field) => (
        <label key={field.key} className="block text-xs">
          <span className="font-medium">{field.label}</span>
          <span className="ml-2 text-muted-foreground">{field.hint}</span>
          <Input
            value={vars[field.key]}
            placeholder={DEFAULT_VCP_SETUP_VARS[field.key]}
            onChange={(event) => onChange({ ...vars, [field.key]: event.target.value })}
            className="mt-1 h-8 bg-background text-xs"
            spellCheck={false}
          />
        </label>
      ))}
    </div>
  );
}

function WriteSummary({ result }: { result: VcpWriteResult }) {
  return (
    <div className="space-y-1 rounded-md border bg-background/60 p-2.5 text-xs leading-relaxed">
      {result.written.length > 0 && (
        <p className="text-emerald-700 dark:text-emerald-300">新增 {result.written.length} 个文件</p>
      )}
      {result.createdDirs.length > 0 && (
        <p className="text-emerald-700 dark:text-emerald-300">新建文件夹：{result.createdDirs.join("、")}</p>
      )}
      {result.skipped.length > 0 && (
        <p className="text-muted-foreground">
          已存在、没动：{result.skipped.map((path) => path.split("/").pop()).join("、")}
        </p>
      )}
      {result.failed.map((item) => (
        <p key={item.relPath} className="text-rose-700 dark:text-rose-300">
          写入失败 {item.relPath}：{item.message}
        </p>
      ))}
    </div>
  );
}

type ConnectState =
  | { status: "idle" }
  | { status: "working" }
  | { status: "done"; message: string; warning?: string }
  | { status: "fail"; message: string };

/** 填地址和密钥 → 检查 Bridge → 建提供商。本机流程写完文件后也用它。 */
function ConnectStep({ initialBaseUrl, vcpRoot }: { initialBaseUrl: string; vcpRoot?: string }) {
  const [baseUrl, setBaseUrl] = useState(initialBaseUrl);
  const [apiKey, setApiKey] = useState("");
  const [manualModels, setManualModels] = useState("");
  const [keyNote, setKeyNote] = useState<string | null>(null);
  const [state, setState] = useState<ConnectState>({ status: "idle" });

  const readKey = async () => {
    if (!vcpRoot) return;
    const config = await readVcpBridgeConfig(vcpRoot, true);
    if (config.key) {
      setApiKey(config.key);
      setKeyNote("已从 VCP 配置读取密钥（不显示内容）");
    } else {
      setKeyNote("VCP 配置里没找到密钥，请手动粘贴");
    }
  };

  const connect = async () => {
    setState({ status: "working" });
    const probe = await probeBridge(baseUrl, apiKey);
    if (!probe.ok) {
      setState({ status: "fail", message: probe.message });
      return;
    }
    const typed = manualModels
      .split(/[\s,，]+/u)
      .map((item) => item.trim())
      .filter(Boolean);
    const models = probe.models.length > 0 ? probe.models : typed;
    const result = applyVcpProvider({ baseUrl, apiKey, models });
    setState({
      status: "done",
      message: `${result.created ? "已新建" : "已更新"}提供商「VCP Bridge（一键配置）」，${result.modelCount} 个模型。共读、记忆、后台请求会自动用 deepreader-* Profile；问答用你 VCP 的默认角色。`,
      warning:
        result.modelCount === 0
          ? `${probe.modelsError ?? "没有模型"}：在下面填模型名（空格分隔）再点一次，或去「模型提供商」里添加。`
          : probe.modelsError,
    });
  };

  return (
    <div className="space-y-2 text-xs">
      <label className="block">
        <span className="font-medium">Bridge 地址</span>
        <Input
          value={baseUrl}
          onChange={(event) => setBaseUrl(event.target.value)}
          className="mt-1 h-8 bg-background text-xs"
          spellCheck={false}
        />
      </label>
      <label className="block">
        <span className="font-medium">密钥</span>
        <span className="ml-2 text-muted-foreground">Bridge 的 BRIDGE_UPSTREAM_KEY，没设就是 VCP 的 Key</span>
        <div className="mt-1 flex gap-2">
          <Input
            type="password"
            value={apiKey}
            onChange={(event) => {
              setApiKey(event.target.value);
              setKeyNote(null);
            }}
            className="h-8 flex-1 bg-background text-xs"
            autoComplete="off"
          />
          {vcpRoot && (
            <Button size="sm" variant="outline" className="h-8" onClick={() => void readKey()}>
              从 VCP 配置读取
            </Button>
          )}
        </div>
        {keyNote && <span className="mt-1 block text-muted-foreground">{keyNote}</span>}
      </label>
      {state.status === "done" && state.warning && (
        <label className="block">
          <span className="font-medium">模型名（可选）</span>
          <Input
            value={manualModels}
            placeholder="例如 gemini-3.8-flash-high gemini-3.8-flash"
            onChange={(event) => setManualModels(event.target.value)}
            className="mt-1 h-8 bg-background text-xs"
            spellCheck={false}
          />
        </label>
      )}
      <Button size="sm" disabled={state.status === "working" || !apiKey.trim()} onClick={() => void connect()}>
        {state.status === "working" && <Loader2 className="mr-1 size-3.5 animate-spin" />}
        检查并连接
      </Button>
      {state.status === "fail" && (
        <p className="flex items-start gap-1.5 text-rose-700 dark:text-rose-300">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
          {state.message}
        </p>
      )}
      {state.status === "done" && (
        <div className="space-y-1">
          <p className="flex items-start gap-1.5 text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
            {state.message}
          </p>
          {state.warning && <p className="text-amber-700 dark:text-amber-300">{state.warning}</p>}
        </div>
      )}
    </div>
  );
}

function LocalFlow() {
  const [vars, setVars] = useState<VcpSetupVars>(DEFAULT_VCP_SETUP_VARS);
  const [inspection, setInspection] = useState<VcpFolderInspection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<VcpWriteResult | null>(null);
  const [port, setPort] = useState(3100);
  const checked = useMemo(() => normalizeVcpSetupVars(vars), [vars]);

  const choose = async () => {
    setError(null);
    setResult(null);
    const picked = await pickFolder("选择 VCPToolBox 文件夹");
    if (!picked) return;
    setBusy(true);
    try {
      const found = await inspectVcpFolder(picked, checked.vars);
      if (!found) {
        setInspection(null);
        setError(
          "这个文件夹里没有 Plugin/VCPBridgeServer。请选 VCPToolBox 本身（里面有 Plugin、dailynote 等文件夹）。",
        );
        return;
      }
      setInspection(found);
      setPort((await readVcpBridgeConfig(found.root, false)).port);
    } finally {
      setBusy(false);
    }
  };

  // 改了变量要重新算（日记本名字影响文件夹和内容）。
  const refresh = async () => {
    if (!inspection) return;
    setBusy(true);
    try {
      setInspection(await inspectVcpFolder(inspection.root, checked.vars));
    } finally {
      setBusy(false);
    }
  };

  const write = async () => {
    if (!inspection || checked.errors.length > 0) return;
    setBusy(true);
    try {
      const fresh = (await inspectVcpFolder(inspection.root, checked.vars)) ?? inspection;
      setInspection(fresh);
      setResult(await writeVcpFiles(fresh.root, fresh.plan.create, fresh.missingDirs));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 text-xs">
      <section className="space-y-2">
        <p className="font-medium">1. 填三个名字</p>
        <VarsForm vars={vars} onChange={(next) => setVars(next)} />
        {checked.errors.map((message) => (
          <p key={message} className="text-rose-700 dark:text-rose-300">
            {message}
          </p>
        ))}
      </section>

      <section className="space-y-2">
        <p className="font-medium">2. 选 VCPToolBox 文件夹</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void choose()}>
            <FolderOpen className="mr-1 size-3.5" />
            {inspection ? "重新选择" : "选择文件夹"}
          </Button>
          {inspection && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void refresh()}>
              改了名字？重新检查
            </Button>
          )}
          {inspection && <span className="break-all text-muted-foreground">{inspection.root}</span>}
        </div>
        {error && <p className="text-rose-700 dark:text-rose-300">{error}</p>}
        {inspection && !result && (
          <div className="space-y-1 rounded-md border bg-background/60 p-2.5 leading-relaxed">
            <p>
              将新增 {inspection.plan.create.length} 个文件：
              <span className="text-muted-foreground">
                {inspection.plan.create.map((file) => file.relPath.split("/").pop()).join("、") || "无"}
              </span>
            </p>
            {inspection.plan.skip.length > 0 && (
              <p className="text-muted-foreground">
                已存在、会跳过（不覆盖）：{inspection.plan.skip.map((file) => file.relPath.split("/").pop()).join("、")}
              </p>
            )}
            {inspection.missingDirs.length > 0 && <p>将新建文件夹：{inspection.missingDirs.join("、")}</p>}
            <p className="text-muted-foreground">Bridge 会自动加载新 Profile，不用重启 VCP。</p>
          </div>
        )}
      </section>

      {inspection && !result && (
        <Button
          size="sm"
          disabled={
            busy ||
            checked.errors.length > 0 ||
            (inspection.plan.create.length === 0 && inspection.missingDirs.length === 0)
          }
          onClick={() => void write()}
        >
          {busy && <Loader2 className="mr-1 size-3.5 animate-spin" />}
          写入（只新增，不覆盖）
        </Button>
      )}
      {inspection && !result && inspection.plan.create.length === 0 && inspection.missingDirs.length === 0 && (
        <p className="text-muted-foreground">文件都已经在了，可以直接连接：</p>
      )}

      {result && <WriteSummary result={result} />}

      {inspection && (result || (inspection.plan.create.length === 0 && inspection.missingDirs.length === 0)) && (
        <section className="space-y-2">
          <p className="font-medium">3. 连接 DeepReader</p>
          <ConnectStep initialBaseUrl={`http://127.0.0.1:${port}/v1`} vcpRoot={inspection.root} />
        </section>
      )}
    </div>
  );
}

function ExportFlow() {
  const [vars, setVars] = useState<VcpSetupVars>(DEFAULT_VCP_SETUP_VARS);
  const [result, setResult] = useState<VcpWriteResult | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const checked = useMemo(() => normalizeVcpSetupVars(vars), [vars]);

  const run = async () => {
    const picked = await pickFolder("选择导出到哪个文件夹（建议新建一个空文件夹）");
    if (!picked) return;
    setBusy(true);
    try {
      setTarget(picked);
      setResult(await exportVcpPack(picked, checked.vars));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 text-xs">
      <VarsForm vars={vars} onChange={setVars} />
      {checked.errors.map((message) => (
        <p key={message} className="text-rose-700 dark:text-rose-300">
          {message}
        </p>
      ))}
      <Button size="sm" disabled={busy || checked.errors.length > 0} onClick={() => void run()}>
        {busy && <Loader2 className="mr-1 size-3.5 animate-spin" />}
        选文件夹并导出
      </Button>
      {result && (
        <>
          <WriteSummary result={result} />
          <p className="text-muted-foreground leading-relaxed">
            已导出到 <span className="break-all">{target}</span>。把里面的 Plugin 和 dailynote 文件夹复制进 VCP
            那台电脑的 VCPToolBox（同名文件保留对方的），然后回到这里选「连接已配置好的
            VCP」。详见文件夹里的「说明.txt」。
          </p>
        </>
      )}
    </div>
  );
}

export function VcpSetupWizard({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [mode, setMode] = useState<Mode>("choose");
  const android = useMemo(() => isAndroidPlatform(), []);

  const choices: { id: Exclude<Mode, "choose">; title: string; hint: string; hidden?: boolean }[] = [
    {
      id: "local",
      title: "配置这台电脑上的 VCP",
      hint: "选 VCPToolBox 文件夹，自动写入 Profile、建日记本、连好 DeepReader",
      hidden: android,
    },
    {
      id: "export",
      title: "导出配置包（VCP 在别的电脑上）",
      hint: "导出到一个文件夹，复制进那台电脑的 VCPToolBox",
      hidden: android,
    },
    {
      id: "connect",
      title: "连接已配置好的 VCP",
      hint: android
        ? "先在电脑上用「一键配置 VCP」配好，再在这里填地址和密钥"
        : "配置包已经放进 VCP 了，只填地址和密钥",
    },
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setMode("choose");
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>一键配置 VCP</DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            给 VCP 加上 DeepReader 专用的 4 个
            Profile（自动共读、记忆提取、后台小请求、阅读日记）和阅读日记本。只新增文件，不改你已有的任何 Profile
            和设置。
          </DialogDescription>
        </DialogHeader>

        {mode === "choose" ? (
          <div className="space-y-2">
            {choices
              .filter((choice) => !choice.hidden)
              .map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  className="block w-full rounded-md border bg-background/60 p-3 text-left hover:bg-muted"
                  onClick={() => setMode(choice.id)}
                >
                  <span className="block text-sm">{choice.title}</span>
                  <span className="mt-0.5 block text-muted-foreground text-xs">{choice.hint}</span>
                </button>
              ))}
          </div>
        ) : (
          <div className="space-y-3">
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setMode("choose")}>
              ← 返回
            </Button>
            {mode === "local" && <LocalFlow />}
            {mode === "export" && <ExportFlow />}
            {mode === "connect" && <ConnectStep initialBaseUrl="http://127.0.0.1:3100/v1" />}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

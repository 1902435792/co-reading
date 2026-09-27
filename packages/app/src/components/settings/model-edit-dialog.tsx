import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEffect, useState } from "react";
import { VCP_BRIDGE_PROFILES, bridgeModelName, composeBridgeModelId, splitBridgeModelId } from "./vcp-bridge-models";

interface ModelEditDialogProps {
  open: boolean;
  mode: "add" | "edit";
  initialData?: { id: string; name: string };
  onSave: (data: { id: string; name: string }) => void;
  onCancel: () => void;
  /** VCP Bridge 提供商：给出可点选的基础模型，显示 Profile 快捷填写。 */
  bridgeBaseModels?: string[];
}

export default function ModelEditDialog({
  open,
  mode,
  initialData,
  onSave,
  onCancel,
  bridgeBaseModels,
}: ModelEditDialogProps) {
  const [modelData, setModelData] = useState({ id: "", name: "" });

  useEffect(() => {
    if (open) {
      setModelData(initialData || { id: "", name: "" });
    }
  }, [open, initialData]);

  const handleSave = () => {
    const trimmedId = modelData.id.trim();
    if (!trimmedId) return;

    onSave({
      id: trimmedId,
      name: modelData.name.trim() || trimmedId,
    });
  };

  // VCP 快捷填写：点 Profile 或基础模型就拼出「Profile/模型」。名称为空或还是上次自动生成的，就跟着更新。
  const { profile: currentProfile, model: currentModel } = splitBridgeModelId(modelData.id);
  const pickBridge = (profile: string, model: string) => {
    setModelData((prev) => {
      const before = splitBridgeModelId(prev.id);
      const autoName = !prev.name.trim() || prev.name === bridgeModelName(before.profile, before.model);
      const id = composeBridgeModelId(profile, model);
      return { id, name: autoName && model ? bridgeModelName(profile, model) : prev.name };
    });
  };
  const chip = (active: boolean) =>
    `rounded-full border px-2 py-0.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
      active ? "border-transparent bg-primary text-primary-foreground" : "hover:bg-muted"
    }`;

  const handleCancel = () => {
    setModelData({ id: "", name: "" });
    onCancel();
  };

  return (
    <Dialog open={open} onOpenChange={(open) => (open ? undefined : handleCancel())}>
      <DialogContent className="w-100 overflow-hidden rounded-2xl">
        <DialogHeader className="border-b px-5 py-4" showCloseButton>
          <DialogTitle className="font-semibold text-base dark:text-neutral-100">
            {mode === "add" ? "添加新模型" : "编辑模型"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-5 px-5 py-5">
          {bridgeBaseModels && (
            <div className="space-y-2 rounded-lg border border-dashed p-3">
              <p className="font-medium text-neutral-600 text-xs dark:text-neutral-300">
                VCP 快捷填写（点选即可，不用手打前缀）
              </p>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Profile">
                {VCP_BRIDGE_PROFILES.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    title={`${option.id}：${option.hint}`}
                    className={chip(currentProfile === option.id)}
                    onClick={() => pickBridge(option.id, currentModel || bridgeBaseModels[0] || "")}
                  >
                    {option.label}
                  </button>
                ))}
                <button
                  type="button"
                  title="不带前缀：Bridge 会套用全局提示词"
                  className={chip(!currentProfile && Boolean(currentModel))}
                  onClick={() => pickBridge("", currentModel || bridgeBaseModels[0] || "")}
                >
                  无前缀
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="基础模型">
                {bridgeBaseModels.map((model) => (
                  <button
                    key={model}
                    type="button"
                    className={chip(currentModel === model)}
                    onClick={() => pickBridge(currentProfile, model)}
                  >
                    {model}
                  </button>
                ))}
              </div>
              {currentProfile && (
                <p className="text-[11px] text-muted-foreground">
                  {VCP_BRIDGE_PROFILES.find((option) => option.id === currentProfile)?.hint ??
                    `自定义 Profile：${currentProfile}`}
                </p>
              )}
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="font-medium text-neutral-600 text-xs dark:text-neutral-300">
              模型 ID {mode === "add" && <span className="text-red-500">*</span>}
            </Label>
            <Input
              value={modelData.id}
              onChange={(e) => setModelData((prev) => ({ ...prev, id: e.target.value }))}
              placeholder={bridgeBaseModels ? "coreading-lite/gemini-3.8-flash-high" : "gemini-1.5-flash"}
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="font-medium text-neutral-600 text-xs dark:text-neutral-300">模型名称</Label>
            <Input
              value={modelData.name}
              onChange={(e) => setModelData((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Gemini 1.5 Flash"
              className="h-9 text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} size="sm">
            取消
          </Button>
          <Button onClick={handleSave} disabled={!modelData.id.trim()} size="sm">
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

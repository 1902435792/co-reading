import { useExportSettingsStore } from "@/store/export-settings-store";
import { exists, mkdir, writeTextFile } from "@tauri-apps/plugin-fs";

export function getObsidianVaultPath(): string {
  return useExportSettingsStore.getState().obsidianVaultPath?.trim() ?? "";
}

/** 写入 Obsidian 库根目录，返回文件路径。 */
export async function exportMarkdownToObsidian(fileName: string, markdown: string): Promise<string> {
  const vaultPath = getObsidianVaultPath();
  if (!vaultPath) throw new Error("还没有设置 Obsidian 库路径");
  if (!(await exists(vaultPath))) await mkdir(vaultPath, { recursive: true });
  const safeName = fileName.replace(/[\\/:*?"<>|]/g, "_").trim() || "章末卡片";
  const filePath = `${vaultPath}/${safeName}.md`;
  await writeTextFile(filePath, markdown.endsWith("\n") ? markdown : `${markdown}\n`);
  return filePath;
}

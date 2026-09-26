import { useAppSettingsStore } from "@/store/app-settings-store";

export const OPEN_SETTINGS_EVENT = "deepreader:open-settings";

/** 打开设置对话框，并可直接跳到某一页（如 "co-reading"）。 */
export function openSettings(section?: string) {
  const state = useAppSettingsStore.getState();
  if (!state.isSettingsDialogOpen) state.toggleSettingsDialog();
  if (section) {
    window.dispatchEvent(new CustomEvent<string>(OPEN_SETTINGS_EVENT, { detail: section }));
  }
}

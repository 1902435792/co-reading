import { getCurrentWindow } from "@tauri-apps/api/window";
import { type as getOsType } from "@tauri-apps/plugin-os";

/**
 * 写日记改成后台进行：对话框可以随时关掉，写完用通知提示。
 * 桌面版在写日记时关掉主窗口：先把窗口藏起来，等日记写完（最多 3 分钟）再真正退出。
 */

const pending = new Set<Promise<unknown>>();
const MAX_BACKGROUND_WAIT_MS = 180_000;

export function trackDiaryWrite<T>(promise: Promise<T>): Promise<T> {
  pending.add(promise);
  const done = () => pending.delete(promise);
  promise.then(done, done);
  return promise;
}

export function hasPendingDiaryWrites(): boolean {
  return pending.size > 0;
}

export async function waitForDiaryWrites(timeoutMs = MAX_BACKGROUND_WAIT_MS): Promise<void> {
  if (pending.size === 0) return;
  await Promise.race([
    Promise.allSettled([...pending]),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

let installed = false;

/** 挂一次即可（应用根部）。安卓上关掉界面本来就在后台继续，不需要拦截。 */
export function installDiaryCloseGuard(): void {
  if (installed) return;
  installed = true;
  let os: string;
  try {
    os = getOsType();
  } catch {
    return; // 浏览器预览等非 Tauri 环境
  }
  if (os === "android" || os === "ios") return;
  const win = getCurrentWindow();
  void win
    .onCloseRequested(async (event) => {
      if (!hasPendingDiaryWrites()) return;
      event.preventDefault();
      await win.hide();
      await waitForDiaryWrites();
      await win.destroy();
    })
    .catch(() => {
      installed = false;
    });
}

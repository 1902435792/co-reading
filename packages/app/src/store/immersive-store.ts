import { create } from "zustand";
import { useLayoutStore } from "./layout-store";

interface ImmersiveState {
  /** 沉浸阅读：隐藏顶栏、底栏和两侧侧栏，只留正文和小头像 Nova。 */
  immersive: boolean;
  /** 进入前的侧栏状态，退出时恢复。 */
  saved: { chat: boolean; notepad: boolean } | null;
  enterImmersive: () => void;
  exitImmersive: () => void;
  toggleImmersive: () => void;
}

export const useImmersiveStore = create<ImmersiveState>()((set, get) => ({
  immersive: false,
  saved: null,
  enterImmersive: () => {
    if (get().immersive) return;
    const layout = useLayoutStore.getState();
    set({ immersive: true, saved: { chat: layout.isChatVisible, notepad: layout.isNotepadVisible } });
    useLayoutStore.setState({ isChatVisible: false, isNotepadVisible: false });
  },
  exitImmersive: () => {
    const { immersive, saved } = get();
    if (!immersive) return;
    set({ immersive: false, saved: null });
    if (saved) useLayoutStore.setState({ isChatVisible: saved.chat, isNotepadVisible: saved.notepad });
  },
  toggleImmersive: () => {
    if (get().immersive) get().exitImmersive();
    else get().enterImmersive();
  },
}));

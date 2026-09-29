import { ChevronDown } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

/**
 * 手机上的侧栏：从底部滑出的整屏面板，盖在书上面（书不重排）。
 * 第一次打开后不卸载，收起时只是藏起来，保留聊天 / 笔记的状态。
 */
export function PhoneSheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);
  if (!mounted) return null;
  return (
    <div
      className={`absolute inset-0 z-40 flex flex-col bg-background transition-transform duration-200 ease-out ${
        open ? "translate-y-0" : "pointer-events-none translate-y-full"
      }`}
      aria-hidden={!open}
      inert={!open || undefined}
    >
      <div className="flex h-10 shrink-0 select-none items-center justify-between border-b px-3">
        <span className="font-medium text-sm">{title}</span>
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1 rounded-full px-3 py-1 text-neutral-600 text-sm active:bg-muted dark:text-neutral-300"
        >
          <ChevronDown className="size-4" />
          收起
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}

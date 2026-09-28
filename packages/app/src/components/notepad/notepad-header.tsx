import { Button } from "@/components/ui/button";
import { BookMarked } from "lucide-react";

interface NotepadHeaderProps {
  /** 划线条数（「整理」只整理划线）。 */
  annotationCount: number;
  /** 书评区帖子数；不传时显示划线条数。 */
  threadCount?: number;
  onOpenDigest: () => void;
}

export const NotepadHeader = ({ annotationCount, threadCount, onOpenDigest }: NotepadHeaderProps) => {
  return (
    <div className="flex select-none items-center justify-between border-border border-b px-2 py-1.5">
      <span className="text-muted-foreground text-xs">
        {threadCount === undefined ? `${annotationCount} 条记录` : `书评区 · ${threadCount} 个帖子`}
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1 rounded-full text-xs hover:bg-accent"
        onClick={onOpenDigest}
        disabled={annotationCount === 0}
      >
        <BookMarked className="size-3.5" />
        整理
      </Button>
    </div>
  );
};

import { useIsPhone } from "@/hooks/use-is-phone";
import type React from "react";

interface PopupButtonProps {
  label: string | undefined;
  Icon: React.ElementType;
  onClick: () => void;
  isVertical?: boolean;
}

const PopupButton: React.FC<PopupButtonProps> = ({ label, Icon, onClick, isVertical = false }) => {
  // 手机上一行放不下「图标 + 文字」：改成图标在上、小字在下，像手机工具栏。
  const isPhone = useIsPhone();
  const handleClick = () => {
    onClick();
  };

  return (
    <div className="flex items-center justify-center">
      <button
        onClick={handleClick}
        className={`flex cursor-pointer items-center justify-center gap-1 rounded p-0 transition-colors duration-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 ${
          isVertical
            ? "h-auto w-6 flex-col px-0 py-1"
            : isPhone
              ? "h-8 min-w-7 flex-col gap-0.5 whitespace-nowrap px-1 leading-none"
              : "h-6 min-w-6 px-1"
        }`}
      >
        <Icon size={isPhone && !isVertical ? 15 : 16} />
        {label && <span className={isPhone && !isVertical ? "text-[10px]" : "text-sm"}>{label}</span>}
      </button>
    </div>
  );
};

export default PopupButton;

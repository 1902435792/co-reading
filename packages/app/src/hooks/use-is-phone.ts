import { useMediaQuery } from "react-responsive";

/** 手机竖屏（宽度 ≤ 600 CSS px）。只在这个范围内切换成手机布局，平板 / 电脑不受影响。 */
export const PHONE_MAX_WIDTH = 600;

export const useIsPhone = () => useMediaQuery({ maxWidth: PHONE_MAX_WIDTH });

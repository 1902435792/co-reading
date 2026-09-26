import type { AnimationItem } from "lottie-web";
import { useEffect, useRef, useState } from "react";
import type { NovaAnimationData } from "./nova-lottie";

interface NovaLottiePlayerProps {
  data: NovaAnimationData;
  loop: boolean;
  playing: boolean;
  /** 动画加载前、加载失败或减少动态效果时显示的静态图。 */
  fallbackSrc: string;
  reducedMotion: boolean;
  onComplete?: () => void;
}

/** lottie-web（轻量 SVG 版）按需加载：关闭形象时完全不下载。 */
export function NovaLottiePlayer({
  data,
  loop,
  playing,
  fallbackSrc,
  reducedMotion,
  onComplete,
}: NovaLottiePlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<AnimationItem | null>(null);
  const onCompleteRef = useRef(onComplete);
  const playingRef = useRef(playing);
  const [ready, setReady] = useState(false);
  onCompleteRef.current = onComplete;
  playingRef.current = playing;

  useEffect(() => {
    if (reducedMotion) return;
    let cancelled = false;
    setReady(false);
    void import("lottie-web/build/player/lottie_light")
      .then(({ default: lottie }) => {
        const container = containerRef.current;
        if (cancelled || !container) return;
        const animation = lottie.loadAnimation({
          container,
          renderer: "svg",
          loop,
          autoplay: playingRef.current,
          animationData: data,
          rendererSettings: { preserveAspectRatio: "xMidYMid meet" },
        });
        animation.addEventListener("complete", () => onCompleteRef.current?.());
        animation.addEventListener("DOMLoaded", () => {
          if (!cancelled) setReady(true);
        });
        animationRef.current = animation;
      })
      .catch((error: unknown) => {
        console.warn("[nova] lottie 加载失败，改用静态头像", error);
      });
    return () => {
      cancelled = true;
      animationRef.current?.destroy();
      animationRef.current = null;
    };
  }, [data, loop, reducedMotion]);

  useEffect(() => {
    const animation = animationRef.current;
    if (!animation) return;
    if (playing) animation.play();
    else animation.pause();
  }, [playing]);

  return (
    <div className="relative size-full">
      {(!ready || reducedMotion) && (
        <img
          src={fallbackSrc}
          alt=""
          draggable={false}
          className="absolute top-[22.8%] left-[15.7%] w-[68.6%] rounded-full shadow-md ring-4 ring-white"
        />
      )}
      <div
        ref={containerRef}
        aria-hidden
        className={`absolute inset-0 ${ready && !reducedMotion ? "" : "invisible"}`}
      />
    </div>
  );
}

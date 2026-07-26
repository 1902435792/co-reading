import { memo, useEffect, useRef, useState } from "react";

interface MindmapViewerProps {
  mermaidCode: string;
}

type MermaidModule = typeof import("mermaid")["default"];

// mermaid 体积约 2.7MB，只在真正渲染思维导图时才加载。
// 用模块级 promise 缓存，避免并发渲染重复加载与重复 initialize。
let mermaidPromise: Promise<MermaidModule> | null = null;

const loadMermaid = () => {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((mod) => {
      const mermaid = mod.default;
      mermaid.initialize({
        startOnLoad: false,
        theme: "default",
        mindmap: {
          useMaxWidth: true,
          padding: 16,
        },
        securityLevel: "strict",
      });
      return mermaid;
    });
  }
  return mermaidPromise;
};

const MindmapViewerComponent = ({ mermaidCode }: MindmapViewerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || !mermaidCode) return;

    let cancelled = false;

    const renderMermaid = async () => {
      try {
        setError(null);
        const mermaid = await loadMermaid();
        if (cancelled) return;

        const id = `mermaid-${Date.now()}`;
        const { svg } = await mermaid.render(id, mermaidCode.trim());
        if (cancelled || !containerRef.current) return;

        containerRef.current.innerHTML = svg;

        // Make SVG responsive
        const svgEl = containerRef.current.querySelector("svg");
        if (svgEl) {
          svgEl.style.maxWidth = "100%";
          svgEl.style.height = "auto";
          svgEl.style.minHeight = "300px";
        }
      } catch (err) {
        if (cancelled) return;
        console.error("Mermaid render failed:", err);
        setError(err instanceof Error ? err.message : "思维导图渲染失败");
      }
    };

    renderMermaid();

    return () => {
      cancelled = true;
    };
  }, [mermaidCode]);

  if (error) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-muted-foreground">
        <p className="text-sm">思维导图渲染失败</p>
        <pre className="max-h-40 w-full overflow-auto rounded bg-muted p-3 text-xs">{error}</pre>
        <details className="w-full">
          <summary className="cursor-pointer text-muted-foreground text-xs">查看原始代码</summary>
          <pre className="mt-2 max-h-60 overflow-auto rounded bg-muted p-3 text-xs">{mermaidCode}</pre>
        </details>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div className="relative flex-1 overflow-auto px-4 py-2">
        <div ref={containerRef} className="flex min-h-[300px] items-center justify-center" />
      </div>
    </div>
  );
};

export const MindmapViewer = memo(MindmapViewerComponent);

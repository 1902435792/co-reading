import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@pdfjs": path.resolve(__dirname, "./public/vendor/pdfjs"),
      "app-tabs": path.resolve(__dirname, "../app-tabs/src/index.tsx"),
    },
  },
  build: {
    // 主入口原本单块 3053 kB，按依赖域拆分以降低首屏解析成本
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (
            /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)
          ) {
            return "vendor-react";
          }
          if (
            id.includes("@ai-sdk") ||
            id.includes("@openrouter") ||
            /[\\/]node_modules[\\/]ai[\\/]/.test(id)
          ) {
            return "vendor-ai";
          }
          if (id.includes("@radix-ui")) return "vendor-radix";
          if (id.includes("@tanstack")) return "vendor-query";
          if (id.includes("foliate") || id.includes("js-md5"))
            return "vendor-reader";
          // shiki 语言语法与 mermaid 图表类型由 Rollup 自动切成按需 chunk，
          // 不要在这里归组，否则会被压成一个 eager 巨块。
          if (
            /[\\/]node_modules[\\/](remark|rehype|micromark|mdast|hast|unist|unified)/.test(
              id
            )
          ) {
            return "vendor-markdown";
          }
          if (id.includes("lucide-react")) return "vendor-icons";
        },
      },
    },
  },
  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));

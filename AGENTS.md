# AGENTS.md

DeepReader 是一个 Tauri 2 + React 19 桌面 AI 阅读器，pnpm workspace。

## 仓库布局

```text
packages/
  app/
    src/                  React、阅读器 UI、AI 服务、状态管理
    src-tauri/            Rust 后端、SQLite、Tauri commands、打包配置
    src-tauri/plugins/tauri-plugin-epub/   EPUB 解析、分块、BM25/向量混合检索
  foliate-js/             电子书渲染与可见页面定位
  app-tabs/               桌面标签页工作区组件
```

## 验证命令

改完代码必须自证。前端类型检查：

```bash
cd packages/app
pnpm exec tsc --noEmit
```

单元测试（Node 22 内置 type stripping，**不要**加 `--import tsx`，根目录没装 tsx）：

```bash
pnpm --filter app test
```

Rust：

```bash
cd packages/app/src-tauri
cargo fmt --all -- --check
cargo check
cargo test --lib
```

生产构建：

```bash
pnpm --filter app build
```

## 硬性约定

### 测试文件的相对 import 必须带 `.ts` 扩展名

`node --test` 直接跑 `.ts` 时走原生 ESM 解析器，不做扩展名补全。写
`from "./reading-position"` 会让整个文件以 `ERR_MODULE_NOT_FOUND` 加载失败，
而且 `tsc --noEmit` **不会**报错（bundler 模式允许省略），所以类型检查绿灯不代表测试能跑。

```ts
// 正确
import { resolveReadingPosition } from "./reading-position.ts";
// 错误：node --test 下加载失败
import { resolveReadingPosition } from "./reading-position";
```

只对测试文件及其直接依赖的相对 import 有此要求；应用代码走 Vite 打包，不受影响。

### 自动共读的核心约束

不要在改动中破坏这些不变量，它们是多轮修复的结果：

- Agent 只能看到读者**当前完整可见页/双页**（`CURRENT_VISIBLE_FOCUS`），不得超前剧透。
- 一个可见焦点只发起一次模型请求，不按 DOM 段落逐条请求。
- 每条书评必须引用可见焦点中的**逐字原文**，`quote` 要能反向定位。
- 翻页、切书、隐藏阅读器必须取消旧焦点请求；旧页失去焦点后不得再写入书评或覆盖连续摘要。
- 普通跟读与范围阅读在提交边界互斥。
- 模型响应走严格 Zod 校验；文本 JSON 回退也必须过同一套校验，不接受额外字段或改写引文。
- 错误分类区分永久错误（额度/认证/Profile 缺失 → fail-fast）与可重试错误（429/网络抖动 → 有界重试）。

主要实现位置：

```text
packages/app/src/pages/reader/hooks/use-co-reading.ts
packages/app/src/services/co-reading-ai-service.ts
packages/app/src/lib/co-reading-*.ts
packages/app/src-tauri/src/core/co_reading/
```

### 数据与隐私

- 持久化的错误文本必须脱敏，不得写入 Bearer token 或 API Key。
- 不要提交密钥、书籍正文、私人笔记、日记、记忆内容或本机用户名路径。
- `.snow/` 是会话产物目录，已 gitignore。

## 代码风格

- Biome 管格式（`biome.json`），2 空格缩进，双引号。
- 注释简明，不堆砌。
- commit message 20 字内，用 conventional prefix：`feat(scope):` / `fix(scope):` / `perf(scope):` / `chore:` / `docs:`。

## 已知非阻断警告

以下是既有问题，不要当成自己引入的回归：

- Vite 提示部分 chunk > 500 kB，部分动态 import 同时被静态 import。
- Rust 存在既有 unused imports。
- Tauri 提示 bundle identifier 以 `.app` 结尾。
- Git 提示 CRLF/LF 规范化。

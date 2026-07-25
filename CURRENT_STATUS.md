# DeepReader / VCP Bridge 当前状态与验收记录

> **状态快照时间**：2026-07-18 00:08（UTC+8）  
> **用途**：记录本机当前可运行状态、已完成能力、验证证据、构建产物、回滚位置和后续复验方式，便于维护与交接。  
> **注意**：本文是一次运行与验收快照，不替代项目面向普通用户的 [`README.md`](README.md)，也不是对 PID、端口占用进程或上游模型可用性的永久保证。

详细实施计划与逐阶段记录见：

- [`.snow/plan/stabilize-coreading-and-bridge-profiles.md`](.snow/plan/stabilize-coreading-and-bridge-profiles.md)

---

## 1. 当前结论

DeepReader Coreading 与 VCP Bridge Profile 管理的四阶段稳定性优化已经完成：

1. **普通共读稳定性**：缩小单批故障范围，增加严格结构化输出恢复、错误分类和有界重试。
2. **失败恢复与范围续读**：修复“重试全部”，支持范围任务从失败 cursor 继续，并维持单活跃任务约束。
3. **VCP Bridge Profile 管理**：恢复 6005/6006 管理 API、管理面板、严格校验、安全持久化和无需 PM2 重启的热加载。
4. **全量构建与部署**：完成源码测试、实时 3100 请求、PM2/端口验收、NSIS 构建、旧安装备份、覆盖安装和安装版持续运行检查。

当前自动化验收结论：

| 区域                    | 状态 | 主要证据                                                      |
| ----------------------- | ---- | ------------------------------------------------------------- |
| DeepReader 共读逻辑     | 通过 | 8 个测试文件，57/57 通过                                      |
| DeepReader 前端         | 通过 | TypeScript + Vite production build                            |
| DeepReader Rust         | 通过 | `cargo check`；library tests 14/14                            |
| VCP Bridge/Admin/Prompt | 通过 | 关键 JS 语法 10/10；测试 24/24                                |
| VCP AdminPanel          | 通过 | `vue-tsc` + Vite production build                             |
| VCP 运行态              | 通过 | 3100 `/health` 200；6005/6006 认证 API 可达                   |
| Coreading 实时模型      | 通过 | `coreading/gpt-5.6-sol` 返回严格 JSON `annotations + summary` |
| Profile 热加载          | 通过 | 创建、更新、删除期间 PM2 未重启；删除后立即 404               |
| NSIS 与安装版           | 通过 | 安装器生成；覆盖安装退出码 0；安装/Release EXE 哈希一致       |
| 用户数据库              | 通过 | 只读 `PRAGMA quick_check=ok`                                  |

---

## 2. 目录、服务与端口

### 2.1 关键目录

| 用途                  | 路径                                                |
| --------------------- | --------------------------------------------------- |
| DeepReader 源码       | `D:\deepreader-src`                                 |
| VCP 源码/运行目录     | `D:\VCP\VCPToolBox`                                 |
| VCP Bridge 插件       | `D:\VCP\VCPToolBox\Plugin\VCPBridgeServer`          |
| VCP Bridge Profiles   | `D:\VCP\VCPToolBox\Plugin\VCPBridgeServer\profiles` |
| DeepReader 安装目录   | `D:\deepreader`                                     |
| DeepReader 用户数据   | `%APPDATA%\com.deepreader.app`                      |
| DeepReader 用户数据库 | `%APPDATA%\com.deepreader.app\database\app.db`      |
| 本次旧安装备份        | `D:\deepreader-backup-20260717-235801\deepreader`   |

### 2.2 服务端口

| 端口   | 服务                                | 长期识别方式                          |
| ------ | ----------------------------------- | ------------------------------------- |
| `3100` | VCP Bridge Runtime                  | PM2 `vcp-main` 内的 `VCPBridgeServer` |
| `6005` | VCP 主服务 / Admin API 上游         | PM2 `vcp-main`                        |
| `6006` | VCP Admin Panel / `/admin_api` 代理 | PM2 `vcp-admin`                       |

`6003` 是旧文档中的历史端口，不是当前 Bridge 默认端口。

---

## 3. DeepReader Coreading 当前行为

### 3.1 普通共读

当前普通共读具有以下约束：

- 单批最多认领 **6 个新文本块**，避免一次模型故障把大量队列项同时打成失败。
- 同时保留约 5000 token 的输入预算和串行处理，避免并发请求风暴。
- selection、single decision 和 batch decision 的 SDK 结构化输出失败时，可尝试从模型原始文本中恢复一个 JSON 对象。
- 文本 JSON 回退仍然必须经过严格校验：
  - 只能包含一个对象；
  - 必须符合对应 Zod schema；
  - 不能夹带工具请求；
  - `blockKey` 必须属于当前已认领文本块；
  - `quote` 必须逐字存在于对应原文；
  - 不接受额外字段、多个对象或改写过的引文。
- 模型请求有明确超时和最多两次尝试；不进行无限重试。
- 单批失败只影响当前小批，后续队列状态保持一致。

### 3.2 错误分类

以下错误被视为永久/配置类错误并 fail-fast：

- 余额或额度不足；
- 401/403 等认证错误；
- Bridge Profile 不存在；
- VCP 原生占位符未展开；
- 明确不可恢复的配置错误。

以下错误可进行有限重试：

- HTTP 429；
- 短时网络、socket、连接异常；
- SDK 结构化输出波动；
- 部分暂时性上游错误。

持久化错误文本会脱敏，不应保存 Bearer token 或 API Key 值。

### 3.3 普通失败重试

“重试全部并恢复跟读”现在会：

1. 把失败块重新放回队列；
2. 立即刷新共读快照；
3. 如果本书原状态是 `paused` 或 `off`，切换为 `active`；
4. 恢复普通共读处理；
5. 按错误类型归组显示失败数量、当前模型和处理建议。

### 3.4 范围阅读与断点恢复

范围任务当前行为：

- selection/decision 的结构化波动可以安全回退，但最终仍执行严格业务校验。
- 遇到余额、认证、Profile 缺失等永久错误时在当前章节停止，不继续消耗请求额度。
- 失败时保留 `cursorIndex`、扫描/选择/处理计数、请求计数和错误原因。
- `failed` 任务可切回 `running`，从原 cursor 继续。
- 恢复失败任务时会保证至少还有必要的后续请求额度。
- 每本书只允许一个 `running` 或 `paused` 范围任务。
- 如果已有其他活跃范围任务，则拒绝恢复失败任务。
- 范围任务运行时会协调普通跟读的暂停与恢复状态。

---

## 4. VCP Bridge Profile 当前契约

### 4.1 Profile 名称

Profile 名称必须严格匹配：

```regex
^[a-z0-9][a-z0-9_-]{0,63}$
```

不会自动进行：

- `trim`；
- 大写转小写；
- 非法字符删除；
- 路径或名称“纠正”。

因此含空格、大写、`.`、`..`、路径分隔符、盘符或其他非法字符的名称会被拒绝。

### 4.2 Profile 选择器

支持三种请求级 Profile 选择方式，优先级为 URL > Header > model 前缀 > `defaultProfile`：

```text
URL:
http://127.0.0.1:3100/v1/<profile>/chat/completions

Header:
X-Bridge-Profile: <profile>

Model prefix:
<profile>/<actual-model>
```

缺失的 URL/Header Profile 返回：

```text
HTTP 404
error.type: profile_not_found
error.message: Requested Bridge Profile does not exist.
```

### 4.3 热加载

Profile 的创建、更新和删除会立即被 Bridge 请求读取：

- 不需要重启 PM2；
- 不依赖 watcher 恰好及时触发才能避免陈旧缓存；
- 文件仍由 chokidar 监控用于缓存列表和诊断；
- 运行请求会按名称重新安全读取 Profile；
- 只有修改 Bridge **监听端口** 时才需要重启服务。

### 4.4 `responseMode`

允许值：

```text
passthrough
structured
assistant
```

当前语义是**声明性元数据**，供管理面板和业务调用方表达预期响应形态；它不会改写 HTTP wire protocol。管理 UI 和 README 不应把它描述为已经实现的响应转换器。

### 4.5 安全与持久化

Profile 管理保留以下安全边界：

- Profile 名称严格校验，防止路径穿越；
- Prompt 只能使用安全相对 `.txt` 路径或受支持的内联文本；
- Prompt 执行 UTF-8、大小、文件类型、目录和存在性检查；
- 禁止通过 symlink/junction/reparse point 越出允许目录；
- 原生 VCP 占位符无法展开时 fail-closed，不把残留占位符发往模型；
- Profile JSON 先规范化和校验，再使用临时文件进行稳定替换；
- 写入失败会清理临时文件；
- 一个损坏的 Profile JSON 不会隐藏其他合法 Profile；
- `profile.example.json` 不进入正常可用 Profile 列表。

### 4.6 Admin API

Profile 管理 API 通过现有 `/admin_api` 认证链提供：

```text
GET    /admin_api/bridge-profiles
GET    /admin_api/bridge-profiles/:name
POST   /admin_api/bridge-profiles/:name
POST   /admin_api/bridge-profiles/:name/activate
POST   /admin_api/bridge-profiles/deactivate
DELETE /admin_api/bridge-profiles/:name
```

6005 和 6006 均要求现有管理员认证。本文不会记录用户名、密码、API Key、Cookie、Bearer token 或 Authorization Header 的值。

### 4.7 当前 Profile 快照

记录时存在的合法 Profile：

```text
coreading
deepreader-coreading-diary
nova
reading
snow
```

记录时检查结果：

```text
defaultProfile: ""
invalidProfiles: []
temporary leftovers: []
```

用户原有 Profile 必须保留，尤其不要删除或覆盖 `coreading.json`。

---

## 5. 验证矩阵

### 5.1 DeepReader

| 检查                             | 结果                           |
| -------------------------------- | ------------------------------ |
| 全部 `*co-reading*.test.ts` 文件 | 8 个文件                       |
| Node tests                       | 57/57 通过                     |
| TypeScript                       | 通过                           |
| Vite production build            | 通过，5136 modules transformed |
| `cargo check`                    | 通过                           |
| Rust `cargo test --lib`          | 14/14 通过                     |
| 任务路径 `git diff --check`      | 通过                           |
| 安装版数据库只读检查             | `PRAGMA quick_check=ok`        |

### 5.2 VCP

| 检查                              | 结果                              |
| --------------------------------- | --------------------------------- |
| 关键 JavaScript `node --check`    | 10/10 通过                        |
| Bridge/Admin/Prompt tests         | 24/24 通过                        |
| AdminPanel `vue-tsc`              | 通过                              |
| AdminPanel Vite build             | 通过，689 modules transformed     |
| VCP 任务路径 `git diff --check`   | 通过                              |
| 3100 `/health`                    | HTTP 200                          |
| 实时 `coreading/gpt-5.6-sol`      | HTTP 200，严格 JSON               |
| 原生占位符残留                    | 未发现                            |
| 6005/6006 未认证 Profile API      | 401                               |
| 6005/6006 已认证 Profile API      | 200                               |
| Profile URL/Header/model selector | 均可解析                          |
| 删除后的 URL/Header selector      | 均为 HTTP 404 `profile_not_found` |
| Profile 变更期间 PM2              | PID、uptime、restart count 不变   |
| Profile 临时文件残留              | 无                                |

### 5.3 实时 Coreading 请求

最终实时请求使用：

```text
POST http://127.0.0.1:3100/v1/coreading/chat/completions
model: gpt-5.6-sol
```

验收结果：

```text
HTTP: 200
content JSON parsed: true
annotations: array
summary: string
residual native placeholder: false
```

上游模型可用性会随时间变化。记录过程中曾观察到可恢复的短时 `Fetch failed after all retries`，随后同一模型直接请求和最终 Coreading 请求均恢复为 200；这也是客户端需要有界重试与可恢复队列的原因。

---

## 6. 记录时运行快照

> PM2 数据记录于 2026-07-18 00:08（UTC+8）；DeepReader 进程于 00:14 重新启动，00:19 复核为 PID 35240、持续响应。所有 PID 都是瞬时快照，服务或应用重启后会变化；长期定位应使用 PM2 名称、监听端口和 executable path，而不是硬编码 PID。

### 6.1 PM2

| PM2 名称    |     PID | 状态   | restart_time | unstable_restarts | 监听       |
| ----------- | ------: | ------ | -----------: | ----------------: | ---------- |
| `vcp-main`  | `39892` | online |            7 |                 0 | 3100、6005 |
| `vcp-admin` |  `9624` | online |            1 |                 0 | 6006       |

端口检查时每个端口均只有一个监听者：

```text
3100 → PID 39892
6005 → PID 39892
6006 → PID 9624
```

最近检查窗口内未发现：

```text
EADDRINUSE
native_preprocessor_unavailable
```

### 6.2 DeepReader 安装版

最新复核进程（应用于 00:14 重新启动，00:19 复核）：

```text
PID: 35240
Executable: D:\deepreader\deepreader.exe
Window title: DeepReader
Responding: true
Main window handle: non-zero
```

桌面快捷方式：

```text
%USERPROFILE%\Desktop\deepreader.lnk
Target: D:\deepreader\deepreader.exe
Working directory: D:\deepreader
```

安装版经过多轮等待后 PID 保持不变、窗口持续响应，Windows Application 日志中没有本次启动后的近期 DeepReader 崩溃事件。

---

## 7. 构建产物、哈希与回滚

### 7.1 NSIS 安装器

路径：

```text
D:\deepreader-src\packages\app\src-tauri\target\release\bundle\nsis\deepreader_0.2.2_x64-setup.exe
```

属性：

```text
Size: 18,027,286 bytes
SHA-256: 84D218E04B24814599965D1D3248DEB39647105E984C3779C808572D44B8261A
```

### 7.2 Release 与已安装可执行文件

```text
Release:
D:\deepreader-src\packages\app\src-tauri\target\release\deepreader.exe

Installed:
D:\deepreader\deepreader.exe

SHA-256（两者一致）:
8DF98228CA0AC345540542F22F14509C928B40C12170E116F133B7A4975BC9BD
```

覆盖安装退出码：

```text
0
```

### 7.3 旧安装备份

备份目录：

```text
D:\deepreader-backup-20260717-235801\deepreader
```

旧可执行文件 SHA-256：

```text
73BF6B41C8AD5E6C4948FCF7F7AA393298EEE82144139C5C556281B68E19FA94
```

如安装版发生严重回归，应先退出当前 DeepReader，再从该备份恢复安装目录。不得删除 `%APPDATA%\com.deepreader.app` 用户数据目录；本轮没有破坏性数据库迁移。

---

## 8. 安全复验命令

以下命令适用于 Windows PowerShell。需要认证的请求不得把凭据写入命令历史或提交到仓库，应从本地安全配置读取并避免打印值。

### 8.1 DeepReader 全部共读测试

```powershell
Set-Location D:\deepreader-src
$tests = Get-ChildItem packages/app/src -Recurse -File -Filter '*co-reading*.test.ts' |
  ForEach-Object { $_.FullName }
node --test $tests
```

预期：

```text
57 tests
57 pass
0 fail
```

### 8.2 DeepReader 前端与 Rust

```powershell
Set-Location D:\deepreader-src
pnpm --filter app build

Set-Location D:\deepreader-src\packages\app\src-tauri
cargo check
cargo test --lib
```

### 8.3 重建 NSIS

```powershell
Set-Location D:\deepreader-src
pnpm --filter app tauri build --bundles nsis
```

重新构建后必须重新计算哈希；本文记录的 SHA-256 只对应本次产物：

```powershell
Get-FileHash `
  D:\deepreader-src\packages\app\src-tauri\target\release\bundle\nsis\deepreader_0.2.2_x64-setup.exe `
  -Algorithm SHA256
```

### 8.4 VCP 语法和测试

```powershell
Set-Location D:\VCP\VCPToolBox

$files = @(
  'Plugin.js',
  'server.js',
  'adminServer.js',
  'routes/adminPanelRoutes.js',
  'routes/admin/bridgeProfiles.js',
  'routes/admin/bridgeProfiles.test.js',
  'routes/admin/finalContext.js',
  'Plugin/VCPBridgeServer/bridgeConfig.js',
  'Plugin/VCPBridgeServer/bridgeConfig.test.js',
  'Plugin/VCPBridgeServer/bridgeserver.js'
)

foreach ($file in $files) {
  node --check $file
  if ($LASTEXITCODE -ne 0) { throw "Syntax check failed: $file" }
}

node --test `
  routes/admin/bridgeProfiles.test.js `
  Plugin/VCPBridgeServer/bridgeConfig.test.js `
  Plugin/VCPBridgeServer/bridgeserver.test.js `
  tests/vcpBridgePromptSecurity.test.js
```

### 8.5 AdminPanel 构建

```powershell
Set-Location D:\VCP\VCPToolBox\AdminPanel-Vue
npm run build
```

该脚本应实际运行 `vue-tsc && vite build`。

### 8.6 PM2 与端口

```powershell
Set-Location D:\VCP\VCPToolBox
node -e "const pm2=require('pm2');pm2.connect(e=>{if(e)throw e;pm2.list((e,l)=>{if(e)throw e;for(const p of l.filter(x=>['vcp-main','vcp-admin'].includes(x.name)))console.log(JSON.stringify({name:p.name,pid:p.pid,status:p.pm2_env.status,restart_time:p.pm2_env.restart_time,unstable_restarts:p.pm2_env.unstable_restarts,pm_uptime:p.pm2_env.pm_uptime}));pm2.disconnect()})});"

foreach ($port in 3100,6005,6006) {
  Get-NetTCPConnection -State Listen -LocalPort $port |
    Select-Object LocalAddress,LocalPort,OwningProcess
}
```

健康检查：

```powershell
Invoke-WebRequest http://127.0.0.1:3100/health -SkipHttpErrorCheck
```

不要使用以下宽泛终止命令：

```text
Stop-Process -Name node*
taskkill /F /IM node.exe
killall node
pkill node
```

如确需操作，只能先识别精确 PID，排除当前 CLI 和其他服务，再按精确 PID 或 PM2 服务名处理。正常部署只应使用 PM2 服务名，例如 `vcp-main`。

### 8.7 Admin/Profile 复验

需要认证的 6005/6006 请求应由本地脚本安全读取 VCP 配置中的管理员凭据，且不得输出：

- 用户名或密码值；
- `Authorization` Header；
- Cookie；
- VCP `Key`/`API_Key`；
- 模型供应商密钥。

使用唯一小写临时名称，例如：

```text
route-smoke-<timestamp>
```

验收顺序：

1. 记录 `vcp-main` PID、uptime 和 restart count；
2. 创建临时 Profile；
3. 立即通过 URL、Header、model 前缀调用；
4. 更新 Profile 并立即调用；
5. 删除 Profile；
6. 验证 URL/Header 均为 404 `profile_not_found`；
7. 确认 PM2 PID、uptime 和 restart count 未改变；
8. 确认没有 `route-smoke-*` 或 `.tmp` 残留。

不得触碰任何现有 Profile。

### 8.8 用户数据库只读检查

确保使用只读 URI，不执行写操作：

```powershell
@'
import os, sqlite3
path = os.path.join(
    os.environ['APPDATA'],
    'com.deepreader.app',
    'database',
    'app.db',
)
conn = sqlite3.connect('file:' + path.replace('\\', '/') + '?mode=ro', uri=True)
print(conn.execute('PRAGMA quick_check').fetchone()[0])
'@ | python -
```

预期输出：

```text
ok
```

---

## 9. 已知非阻断警告

以下警告在本次验收中没有导致失败：

- Vite 提示部分动态 import 同时被静态 import，无法拆分到独立 chunk；
- Vite 提示部分 production chunk 大于 500 kB；
- Rust 存在既有 unused imports；
- Tauri 提示 bundle identifier 以 `.app` 结尾可能与 macOS bundle 扩展名混淆；
- AdminPanel CSS minifier 对既有 `:deep()` 写法给出警告；
- Windows linker 输出 `.lib`/`.exp` 创建提示；
- Git 提示部分文件下次触碰时可能发生 CRLF/LF 规范化。

这些问题可在后续独立优化，不应与本次 Coreading/Profile 稳定性修复混在一起清理。

---

## 10. 验证边界

### 已自动化或运行态验证

- 共读核心、解析、错误分类、范围映射和状态转换测试；
- TypeScript、Vite、Cargo 和 Rust tests；
- VCP Bridge、Admin route、Prompt 安全测试；
- AdminPanel 类型检查与 production build；
- 3100 `/health` 和真实 Coreading 请求；
- Profile 认证 CRUD、热更新和删除 404；
- PM2 PID/restart/uptime 在 Profile 变更期保持不变；
- NSIS 生成、备份、覆盖安装和哈希一致性；
- 安装版窗口持续响应、桌面快捷方式和近期崩溃日志；
- 用户数据库只读完整性检查。

### 未由 CLI 代替人工完成的主观视觉检查

CLI 无法可靠代替用户在 WebView 中逐项点击和评价像素级视觉状态。以下仍可在当前安装版窗口中进行可选目测：

- 打开具体书籍后查看失败分组样式；
- 点击“重试全部并恢复跟读”后的交互反馈；
- 查看范围任务失败继续按钮；
- 查看右侧阅读地图最终布局；
- 查看 AI 批注双链定位到左侧批注栏的视觉表现。

不要为了目测而改写、删除或伪造现有失败记录。

IDE diagnostics 服务在本次会话中不可用，因此使用编译、测试和构建作为替代诊断。最终 QA 子代理也因其上游返回 403 `Insufficient account balance` 未能执行；这次失败没有被计为 QA 通过。

---

## 11. Git 与运维注意事项

### 11.1 DeepReader

记录时：

```text
branch: main
base commit: fa08582750ef8ee8868e64c4ca6ecb9958cceead
subject: feat(reader): add contextual AI co-reading
```

工作区包含本轮和其他既有未提交改动，不能把 base commit 理解为当前安装版的完整源码状态。

### 11.2 VCP

VCP 工作区同样存在大量本任务之外的既有脏改和构建产物差异。全仓库 `git diff --check` 曾被无关的：

```text
Agent/Nova.txt:14 trailing whitespace
```

阻断；本任务涉及的精确路径 diff check 已通过。

`Plugin.js` 具有重要的既有 staged/index 历史，worktree 与 index 也存在明显差异。未经明确审查和授权，禁止：

```text
git reset
git checkout
git restore
从 HEAD 覆盖 Plugin.js
```

也不要执行：

```text
git add .
git clean
```

### 11.3 推送状态

本轮稳定性修复、状态记录和 VCP 本地变更没有在本次验收流程中推送。除非用户另行明确要求，不要推送 DeepReader 或 VCP 仓库。

---

## 12. 后续维护时应更新什么

发生以下变化时，应更新本文的快照部分：

- PM2 重启导致 PID、uptime 或 restart count 变化；
- Bridge/Admin 端口变化；
- Profile 列表或 `defaultProfile` 变化；
- Coreading 默认/绑定模型变化；
- 测试数量变化；
- DeepReader 版本号变化；
- 重新构建 NSIS 或 release EXE；
- 覆盖安装到新版本；
- 创建新的安装备份；
- Git base commit 或发布分支变化。

每次重新构建都必须重新计算并更新文件大小和 SHA-256，不能沿用本文旧值。

---

## 13. 快速交接清单

- [x] 四阶段任务完成
- [x] DeepReader Node 57/57
- [x] DeepReader TypeScript + Vite build
- [x] `cargo check`
- [x] Rust 14/14
- [x] VCP `node --check` 10/10
- [x] VCP tests 24/24
- [x] AdminPanel `vue-tsc` + Vite build
- [x] 3100 `/health` 200
- [x] 实时 Coreading 严格 JSON 200
- [x] 6005/6006 认证保护
- [x] Profile 无重启热加载
- [x] 删除后 404 `profile_not_found`
- [x] NSIS 构建与 SHA-256 留存
- [x] 旧安装备份
- [x] 覆盖安装退出码 0
- [x] 安装版/Release EXE 哈希一致
- [x] 安装版窗口持续响应
- [x] 用户数据库 `quick_check=ok`
- [x] 无临时 Profile/`.tmp` 残留
- [x] 未执行 Git 回滚、广泛 Node 终止或仓库推送

# 安卓原生部分备份

`src-tauri/gen/` 在 .gitignore 里，不进仓库。下面这些是手动改过的安卓原生文件，备份在这里，防止重新执行 `tauri android init` 或换电脑后丢失：

| 文件 | 作用 |
| ---- | ---- |
| `app/src/main/java/com/deepreader/app/CurlView.kt` | 仿真翻页（原生层画卷页） |
| `app/src/main/java/com/deepreader/app/MainActivity.kt` | 全屏 / 状态栏、返回键、音量键翻页、仿真翻页和网页的衔接 |
| `app/src/main/AndroidManifest.xml` | 权限与 Activity 配置 |
| `app/src/main/res/values*/` | 主题、颜色、应用名 |
| `app/build.gradle.kts` | release 签名（从 `DEEPREADER_SIGNING_CONFIG` 指向的 JSON 读取，文件里不含密码） |

`generated/` 下的文件由 Tauri 自动生成，不备份。

## 恢复

```bash
bash packages/app/android-native/restore.sh   # 在仓库根目录执行
```

脚本会先把 gen/android 里现有的同名文件备份成 `*.bak-日期`，再覆盖。

## 改了 gen/ 里的原生文件之后

```bash
bash packages/app/android-native/backup.sh
```

把最新的原生文件同步回这里，再提交。

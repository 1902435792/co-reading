#!/usr/bin/env bash
# 把 src-tauri/gen/android 里的原生文件同步到这里（之后记得提交）
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
GEN="$HERE/../src-tauri/gen/android"
while IFS= read -r f; do
  f="${f%$(printf "\r")}"; [ -z "$f" ] && continue
  mkdir -p "$(dirname "$HERE/$f")"
  cp -p "$GEN/$f" "$HERE/$f"
  echo "备份 $f"
done < "$HERE/files.txt"

#!/usr/bin/env bash
# 把备份的安卓原生文件恢复到 src-tauri/gen/android（覆盖前先留 .bak）
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
GEN="$HERE/../src-tauri/gen/android"
STAMP="$(date +%Y%m%d-%H%M%S)"
while IFS= read -r f; do
  f="${f%$(printf "\r")}"; [ -z "$f" ] && continue
  mkdir -p "$(dirname "$GEN/$f")"
  if [ -f "$GEN/$f" ] && ! cmp -s "$HERE/$f" "$GEN/$f"; then cp -p "$GEN/$f" "$GEN/$f.bak-$STAMP"; fi
  cp -p "$HERE/$f" "$GEN/$f"
  echo "恢复 $f"
done < "$HERE/files.txt"

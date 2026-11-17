#!/bin/sh
# 跨平台初始化入口的薄封装（逻辑在 scripts/init.mjs）
# Windows 用户可直接用：npm run init

DIR="$(cd "$(dirname "$0")" && pwd)"
exec node "$DIR/init.mjs" "$@"

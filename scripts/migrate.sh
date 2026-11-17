#!/bin/sh
# 跨平台迁移入口的薄封装（逻辑在 scripts/migrate.mjs）
# Windows 用户可直接用：npm run db:migrate

DIR="$(cd "$(dirname "$0")" && pwd)"
exec node "$DIR/migrate.mjs" "$@"

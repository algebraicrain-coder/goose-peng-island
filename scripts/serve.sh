#!/usr/bin/env bash
# 启动本地静态服务器（ES 模块需要 http 协议）。
set -e
cd "$(dirname "$0")/.."
PORT="${1:-8123}"
echo "Peng 环岛骑行 → http://localhost:${PORT}/"
exec python3 -m http.server "$PORT" --bind 127.0.0.1

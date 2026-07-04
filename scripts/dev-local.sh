#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"$ROOT_DIR/scripts/dev-setup.sh"

cd "$ROOT_DIR"
printf '[dev] Starting server and client...\n'
exec pnpm run dev:app

#!/bin/bash
# Rebuilds app/src/main/assets/tw.css (committed, so the app works offline). Installs into tailwind/node_modules (git-ignored).
set -e
cd "$(dirname "$0")"
[ -d node_modules/tailwindcss ] || npm install --silent --no-audit --no-fund
npm run -s build
echo "tw.css: $(wc -c < ../app/src/main/assets/tw.css) bytes"

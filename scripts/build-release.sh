#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p dist

echo "Building shim (dist/cli.js)..."
bun build ./src/cli.ts --target=node --outfile=dist/cli.js --banner=$'#!/usr/bin/env node\n'

echo "Building native binaries..."
bun build --compile ./src/index.ts --outfile=dist/git-snapshot-darwin-arm64 --target=bun-darwin-arm64
bun build --compile ./src/index.ts --outfile=dist/git-snapshot-darwin-x64 --target=bun-darwin-x64
bun build --compile ./src/index.ts --outfile=dist/git-snapshot-linux-x64 --target=bun-linux-x64
bun build --compile ./src/index.ts --outfile=dist/git-snapshot-win32-x64.exe --target=bun-windows-x64

echo "Done. dist/ contains cli.js and four binaries."

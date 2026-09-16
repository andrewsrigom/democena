#!/usr/bin/env bash
# Modified for Democena (2026): independent fork naming and configuration.
# Pack democena and prove a one-package install works in a clean Linux container.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v docker >/dev/null 2>&1; then
  echo "democena smoke: docker is not installed or not on PATH." >&2
  exit 1
fi

echo "democena smoke: building package…"
npm run build

PACK_DIR="$ROOT/pack"
rm -rf "$PACK_DIR"
mkdir -p "$PACK_DIR"
# npm pack prints the tarball name on the last line.
TGZ="$(npm pack --pack-destination "$PACK_DIR" | tail -n 1)"
echo "democena smoke: packed $TGZ"

echo "democena smoke: building and running clean Node 22 container…"
docker build \
  -f "$ROOT/scripts/smoke-install.Dockerfile" \
  -t democena-install-smoke \
  --build-arg "TGZ=$TGZ" \
  "$ROOT"

echo "democena smoke: ok (doctor + init --agent + check on examples/basic)."

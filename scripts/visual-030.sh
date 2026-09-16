#!/usr/bin/env bash
# Modified for Democena (2026): independent fork naming and configuration.
# Builds democena, then runs the 0.3.0 visual review example end to end.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXAMPLE="$ROOT/examples/visual-030"
CLI="node $ROOT/dist/cli/index.js"

# Playwright loads TS scenario files; enable stripping when this Node build needs it.
export NODE_OPTIONS="${NODE_OPTIONS:---experimental-strip-types}"

echo "visual-030: building package…"
npm run build --prefix "$ROOT" >/dev/null

echo "visual-030: cleaning previous outputs…"
rm -rf "$EXAMPLE/output" "$EXAMPLE/stills"

echo ""
echo "=== democena video (mp4 only) ==="
(cd "$EXAMPLE" && $CLI video)

echo ""
echo "=== democena gif (reuses raw; gif only) ==="
(cd "$EXAMPLE" && $CLI gif)

echo ""
echo "=== democena images 3 (docs stills) ==="
(cd "$EXAMPLE" && $CLI images 3)

echo ""
echo "=== democena check (frames for caption flip) ==="
(cd "$EXAMPLE" && $CLI check)

echo ""
echo "visual-030: done. Open these:"
echo "  mp4     $EXAMPLE/output/"
ls -1 "$EXAMPLE/output"/*.mp4 2>/dev/null || true
echo "  gif     $EXAMPLE/output/"
ls -1 "$EXAMPLE/output"/*.gif 2>/dev/null || true
echo "  stills  $EXAMPLE/stills/"
ls -1 "$EXAMPLE/stills/"*.png 2>/dev/null || true
echo "  check   $EXAMPLE/output/check/"
find "$EXAMPLE/output/check" -name 'frame*.png' 2>/dev/null | head -8 || true
echo ""
echo "See examples/visual-030/README.md for what to verify in each file."

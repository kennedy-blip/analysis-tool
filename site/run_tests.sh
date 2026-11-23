#!/usr/bin/env bash
# Run every DataLens static-site check.
#
#   ./site/run_tests.sh            # build + python + node parity + golden re-derivation (+ DOM harness)
#   ./site/run_tests.sh --quick    # build + python only
#
# Requirements: python3.11 with Jinja2 (see site/requirements.txt) and node 22+
# for the parity tests. The optional DOM harness needs `npm install` inside
# site/tests/dom first.

set -euo pipefail

SITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SITE_DIR/.." && pwd)"
QUICK="${1:-}"

cd "$SITE_DIR"

echo "==> Building static site"
python3 build.py --quiet
echo "    ok: $(find public -type f | wc -l | tr -d ' ') files in site/public"

echo
echo "==> Python unit + build tests (stdlib unittest)"
python3 -m unittest discover -s tests -t tests

if [[ "$QUICK" == "--quick" ]]; then
  echo
  echo "Quick mode: skipping node suites."
  exit 0
fi

if ! command -v node >/dev/null 2>&1; then
  echo
  echo "node not found -- skipping parity, golden and DOM suites." >&2
  exit 0
fi

echo
echo "==> JavaScript engine parity tests (node --test)"
cd "$REPO_ROOT"
node --test "site/tests/parity/*.test.mjs" | tail -n 12

echo
echo "==> Re-derive golden values from the legacy engine"
if [[ -f "$REPO_ROOT/src/utils/statistics.ts" ]]; then
  REGENERATED="$(mktemp)"
  trap 'rm -f "$REGENERATED"' EXIT
  node "$SITE_DIR/tests/golden/generate_golden.mjs" --out "$REGENERATED" >/dev/null
  python3 "$SITE_DIR/tests/golden/compare_golden.py" "$SITE_DIR/tests/golden_stats.json" "$REGENERATED"
else
  echo "    skipped: legacy source removed (golden_stats.json is the frozen reference)"
fi

if [[ -d "$SITE_DIR/tests/dom/node_modules" ]]; then
  echo
  echo "==> DOM harness (jsdom drives the built pages)"
  cd "$SITE_DIR/tests/dom"
  node harness.mjs | tail -n 3
else
  echo
  echo "==> DOM harness skipped (enable with: cd site/tests/dom && npm install)"
fi

echo
echo "All checks passed."

#!/usr/bin/env python3
"""Compare two golden_stats.json payloads, ignoring volatile metadata.

Used by `site/run_tests.sh` to confirm that re-running the legacy TypeScript
engine still produces the committed reference values. The `meta` block records
the Node version and generation date, so it is excluded from the comparison.

Usage: compare_golden.py COMMITTED.json REGENERATED.json
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Dict


def load_payload(path: Path) -> Dict[str, Any]:
    with path.open(encoding="utf-8") as handle:
        data = json.load(handle)
    data.pop("meta", None)
    return data


def diff_sections(committed: Dict[str, Any], regenerated: Dict[str, Any]) -> list[str]:
    changed = []
    for section in sorted(set(committed) | set(regenerated)):
        if committed.get(section) != regenerated.get(section):
            changed.append(section)
    return changed


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        sys.stderr.write(__doc__ or "")
        return 2

    committed = load_payload(Path(argv[1]))
    regenerated = load_payload(Path(argv[2]))
    changed = diff_sections(committed, regenerated)

    if changed:
        sys.stderr.write("golden_stats.json disagrees with the legacy engine.\n")
        for section in changed:
            sys.stderr.write(f"  differs: {section}\n")
        return 1

    print("    ok: golden values still match the legacy implementation")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))

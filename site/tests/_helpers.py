"""Shared helpers for the DataLens static-site test suite."""

from __future__ import annotations

import json
import math
import sys
import unittest
from pathlib import Path
from typing import Any

TESTS_DIR = Path(__file__).resolve().parent
SITE_DIR = TESTS_DIR.parent
REPO_ROOT = SITE_DIR.parent

# Make `import stats`, `import build`, ... work regardless of the runner's cwd.
if str(SITE_DIR) not in sys.path:
    sys.path.insert(0, str(SITE_DIR))

GOLDEN_PATH = TESTS_DIR / "golden_stats.json"
JSFMT_EXPECTATIONS_PATH = TESTS_DIR / "jsfmt_expectations.json"


def load_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def load_golden() -> Any:
    return load_json(GOLDEN_PATH)


def numbers_equal(actual: Any, expected: Any, tolerance: float = 1e-9) -> bool:
    """Compare a Python result with a value captured from JavaScript.

    ``JSON.stringify`` turns ``Infinity`` into ``null`` and drops ``undefined``
    keys entirely, so both spellings are accepted here.
    """
    if expected is None:
        return actual is None or (isinstance(actual, float) and math.isinf(actual))
    if isinstance(actual, bool) or isinstance(expected, bool):
        return actual == expected
    if isinstance(actual, (int, float)) and isinstance(expected, (int, float)):
        if isinstance(actual, float) and math.isinf(actual):
            return False
        return math.isclose(float(actual), float(expected), rel_tol=tolerance, abs_tol=tolerance)
    return False


class GoldenTestCase(unittest.TestCase):
    """Base class with an assertion that understands the JSON/JS value quirks."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.golden = load_golden()

    def assertMatchesGolden(self, label: str, actual: Any, expected: Any) -> None:
        if isinstance(expected, (int, float)) and not isinstance(expected, bool):
            self.assertTrue(
                numbers_equal(actual, expected),
                f"{label}: python={actual!r} legacy={expected!r}",
            )
        elif expected is None:
            self.assertTrue(
                actual is None or (isinstance(actual, float) and math.isinf(actual)),
                f"{label}: python={actual!r} legacy=null (Infinity/undefined)",
            )
        else:
            self.assertEqual(actual, expected, f"{label}: python={actual!r} legacy={expected!r}")

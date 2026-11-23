"""Parity tests: `site/jsfmt.py` vs V8's `toFixed` / `toLocaleString`.

`tests/jsfmt_expectations.json` holds values captured from a real JavaScript
engine (Node 22) so the build-time rendered numbers are identical to the ones
the React app displayed.
"""

from __future__ import annotations

import json
import unittest

import jsfmt
from _helpers import JSFMT_EXPECTATIONS_PATH, load_json


def parse_repr(text: str) -> float:
    """Recover the double behind the captured JS string (`"-0"` included)."""
    return -0.0 if text == "-0" else float(text)


class JsfmtParityTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.cases = load_json(JSFMT_EXPECTATIONS_PATH)

    def check(self, key: str, actual: str, case: dict) -> None:
        self.assertEqual(actual, case[key], f"{case['repr']}.{key}: python={actual!r} js={case[key]!r}")

    def test_to_fixed_matches_v8(self) -> None:
        for case in self.cases:
            value = parse_repr(case["repr"])
            with self.subTest(value=case["repr"]):
                self.check("f0", jsfmt.fixed(value, 0), case)
                self.check("f1", jsfmt.fixed(value, 1), case)
                self.check("f2", jsfmt.fixed(value, 2), case)
                self.check("f4", jsfmt.fixed(value, 4), case)
                self.check("f6", jsfmt.fixed(value, 6), case)

    def test_to_locale_string_matches_v8(self) -> None:
        for case in self.cases:
            value = parse_repr(case["repr"])
            with self.subTest(value=case["repr"]):
                self.check("loc", jsfmt.locale_string(value), case)

    def test_documented_v8_rounding_quirks(self) -> None:
        # Exact-double rounding: 1.005 sits just below the tie, 0.12345 just above.
        self.assertEqual(jsfmt.fixed(1.005, 2), "1.00")
        self.assertEqual(jsfmt.fixed(0.12345, 4), "0.1235")
        self.assertEqual(jsfmt.fixed(2.675, 2), "2.67")
        # Half away from zero, including negatives.
        self.assertEqual(jsfmt.fixed(-2.5, 0), "-3")
        self.assertEqual(jsfmt.fixed(2.5, 0), "3")
        self.assertEqual(jsfmt.fixed(-0.5, 0), "-1")
        # Zero results keep the sign of a negative input, but -0 prints as 0.
        self.assertEqual(jsfmt.fixed(-0.00001, 4), "-0.0000")
        self.assertEqual(jsfmt.fixed(-0.0, 4), "0.0000")
        # Magnitudes >= 1e21 fall back to String(value).
        self.assertEqual(jsfmt.fixed(1e21, 4), "1e+21")

    def test_non_finite_values(self) -> None:
        self.assertEqual(jsfmt.fixed(float("nan"), 4), "NaN")
        self.assertEqual(jsfmt.fixed(float("inf"), 4), "Infinity")
        self.assertEqual(jsfmt.fixed(float("-inf"), 2), "-Infinity")
        self.assertEqual(jsfmt.locale_string(float("nan")), "NaN")
        self.assertEqual(jsfmt.locale_string(float("inf")), "Infinity")

    def test_grouping_uses_shortest_representation(self) -> None:
        self.assertEqual(jsfmt.locale_string(9.999999e20), "999,999,900,000,000,000,000")
        self.assertEqual(jsfmt.locale_string(1e21), "1,000,000,000,000,000,000,000")
        self.assertEqual(jsfmt.locale_string(1234567), "1,234,567")
        self.assertEqual(jsfmt.locale_string(1234.56789), "1,234.568")
        self.assertEqual(jsfmt.locale_string(-0.18628495471246004), "-0.186")
        self.assertEqual(jsfmt.locale_string(-0.0), "-0")

    def test_js_number_to_string(self) -> None:
        self.assertEqual(jsfmt.js_number_to_string(1e21), "1e+21")
        self.assertEqual(jsfmt.js_number_to_string(1e-7), "1e-7")
        self.assertEqual(jsfmt.js_number_to_string(1e20), "100000000000000000000")
        self.assertEqual(jsfmt.js_number_to_string(3.0), "3")
        self.assertEqual(jsfmt.js_number_to_string(-0.0), "-0")

    def test_stat_card_display_rule(self) -> None:
        # Statistics.tsx prints raw numbers: no grouping for integers.
        self.assertEqual(jsfmt.stat_value(6044), "6044")
        self.assertEqual(jsfmt.stat_value(6044.0), "6044")
        self.assertEqual(jsfmt.stat_value(1168740), "1168740")
        self.assertEqual(jsfmt.stat_value(5843.7), "5843.7000")
        self.assertEqual(jsfmt.stat_value("Yes"), "Yes")
        self.assertEqual(jsfmt.stat_value(True), "true")
        self.assertEqual(jsfmt.stat_value(None), "")

    def test_expectations_file_is_json(self) -> None:
        self.assertIsInstance(self.cases, list)
        self.assertGreaterEqual(len(self.cases), 30)
        for case in self.cases:
            self.assertIn("repr", case)
            self.assertIn("f4", case)
            json.dumps(case)  # must stay serializable


if __name__ == "__main__":
    unittest.main()

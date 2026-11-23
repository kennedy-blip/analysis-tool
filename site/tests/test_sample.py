"""Tests for the deterministic bundled sample dataset (`site/sample.py`).

The legacy app generated demo rows with `Math.random()`, so the dataset differed
on every click. The static build exports a seeded dataset with the same shape and
value ranges; these tests pin that contract down.
"""

from __future__ import annotations

import unittest

from _helpers import SITE_DIR  # noqa: F401  (puts site/ on sys.path first)

import sample
import stats


class SampleDataShapeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.rows = sample.generate_sample_data()

    def test_row_count_matches_readme(self) -> None:
        self.assertEqual(len(self.rows), 200)

    def test_columns_match_the_legacy_generator(self) -> None:
        self.assertEqual(list(self.rows[0]), sample.COLUMNS)
        self.assertEqual(
            sample.COLUMNS,
            ["id", "product", "category", "region", "month", "sales", "quantity", "price", "rating", "inStock"],
        )

    def test_ids_are_sequential(self) -> None:
        self.assertEqual([row["id"] for row in self.rows], list(range(1, 201)))

    def test_product_names_follow_the_legacy_formula(self) -> None:
        self.assertEqual(self.rows[0]["product"], "Product A1")
        self.assertEqual(self.rows[25]["product"], "Product Z1")
        self.assertEqual(self.rows[26]["product"], "Product A2")
        self.assertEqual(self.rows[-1]["product"], "Product R8")
        self.assertEqual(len({row["product"] for row in self.rows}), 200)

    def test_categorical_values_come_from_the_legacy_lists(self) -> None:
        self.assertTrue({row["category"] for row in self.rows} <= set(sample.CATEGORIES))
        self.assertTrue({row["region"] for row in self.rows} <= set(sample.REGIONS))
        self.assertTrue({row["month"] for row in self.rows} <= set(sample.MONTHS))
        self.assertEqual({row["inStock"] for row in self.rows}, {"Yes", "No"})

    def test_every_category_region_and_month_appears(self) -> None:
        self.assertEqual({row["category"] for row in self.rows}, set(sample.CATEGORIES))
        self.assertEqual({row["region"] for row in self.rows}, set(sample.REGIONS))
        self.assertEqual({row["month"] for row in self.rows}, set(sample.MONTHS))

    def test_numeric_ranges_match_the_legacy_expressions(self) -> None:
        sales = [row["sales"] for row in self.rows]
        quantity = [row["quantity"] for row in self.rows]
        price = [row["price"] for row in self.rows]
        rating = [row["rating"] for row in self.rows]

        self.assertTrue(all(isinstance(v, int) for v in sales))
        self.assertTrue(all(500 <= v <= 10500 for v in sales), (min(sales), max(sales)))
        self.assertTrue(all(1 <= v <= 100 for v in quantity), (min(quantity), max(quantity)))
        self.assertTrue(all(10 <= v <= 210 for v in price), (min(price), max(price)))
        self.assertTrue(all(1 <= v <= 5 for v in rating), (min(rating), max(rating)))

        # Math.round((r*200+10)*100)/100 -> exactly two decimals
        self.assertTrue(all(abs(v * 100 - round(v * 100)) < 1e-9 for v in price))
        # Math.round((r*4+1)*10)/10 -> exactly one decimal
        self.assertTrue(all(abs(v * 10 - round(v * 10)) < 1e-9 for v in rating))

    def test_no_missing_values(self) -> None:
        for row in self.rows:
            for column, value in row.items():
                self.assertFalse(stats.is_missing(value), f"{column} is missing")

    def test_column_types(self) -> None:
        for column in ("id", "sales", "quantity", "price", "rating"):
            self.assertEqual(stats.get_column_type([row[column] for row in self.rows]), "numeric", column)
        for column in ("product", "category", "region", "month", "inStock"):
            self.assertEqual(stats.get_column_type([row[column] for row in self.rows]), "string", column)


class SampleDeterminismTest(unittest.TestCase):
    def test_same_seed_produces_identical_rows(self) -> None:
        first = sample.generate_sample_data(rows=50, seed=1234)
        second = sample.generate_sample_data(rows=50, seed=1234)
        self.assertEqual(first, second)

    def test_different_seeds_differ(self) -> None:
        self.assertNotEqual(
            sample.generate_sample_data(rows=20, seed=1),
            sample.generate_sample_data(rows=20, seed=2),
        )

    def test_prefix_is_stable_across_row_counts(self) -> None:
        short = sample.generate_sample_data(rows=10, seed=sample.DEFAULT_SEED)
        long = sample.generate_sample_data(rows=200, seed=sample.DEFAULT_SEED)
        self.assertEqual(short, long[:10])

    def test_defaults_match_site_config(self) -> None:
        import json
        from pathlib import Path

        config = json.loads((Path(sample.__file__).parent / "site.json").read_text(encoding="utf-8"))
        settings = config["sample_dataset"]
        rows = sample.generate_sample_data(rows=settings["rows"], seed=settings["seed"])
        self.assertEqual(len(rows), settings["rows"])
        self.assertEqual(sample.DISPLAY_NAME, settings["display_name"])


class JsRoundingTest(unittest.TestCase):
    def test_js_round_is_half_up_not_bankers(self) -> None:
        self.assertEqual(sample.js_round(0.5), 1)
        self.assertEqual(sample.js_round(1.5), 2)
        self.assertEqual(sample.js_round(2.5), 3)
        self.assertEqual(sample.js_round(-0.5), 0)
        self.assertEqual(sample.js_round(2.4), 2)
        self.assertEqual(sample.js_round(2.6), 3)

    def test_product_name_helper(self) -> None:
        self.assertEqual(sample.js_product_name(0), "Product A1")
        self.assertEqual(sample.js_product_name(27), "Product B2")
        self.assertEqual(sample.js_product_name(199), "Product R8")


if __name__ == "__main__":
    unittest.main()

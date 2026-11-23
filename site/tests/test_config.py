"""Parity tests between `site/site.json` and the legacy React app's constants.

While `src/` still exists the expected values are read straight out of the old
components, so the config cannot silently drift from the app it replaces. Once
the legacy source is deleted (final migration step) the same assertions run
against the frozen literals recorded here.
"""

from __future__ import annotations

import json
import re
import unittest
from pathlib import Path

from _helpers import REPO_ROOT, SITE_DIR

CONFIG_PATH = SITE_DIR / "site.json"
LEGACY_SRC = REPO_ROOT / "src"


def legacy_file(name: str) -> str | None:
    path = LEGACY_SRC / name
    return path.read_text(encoding="utf-8") if path.is_file() else None


def legacy_int(source: str | None, pattern: str, fallback: int) -> int:
    if source is None:
        return fallback
    match = re.search(pattern, source)
    return int(match.group(1)) if match else fallback


def legacy_string_list(source: str | None, pattern: str, fallback: list[str]) -> list[str]:
    if source is None:
        return fallback
    match = re.search(pattern, source, re.S)
    if not match:
        return fallback
    return re.findall(r"'([^']+)'", match.group(1))


class ConfigShapeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))

    def test_identity(self) -> None:
        self.assertEqual(self.config["name"], "DataLens")
        self.assertEqual(self.config["tagline"], "Data Analysis Tool")
        self.assertEqual(self.config["lang"], "en")
        self.assertEqual(self.config["output_dir"], "public")

    def test_views_match_the_legacy_tabs(self) -> None:
        ids = [view["id"] for view in self.config["views"]]
        self.assertEqual(ids, ["overview", "data", "statistics", "probability", "visualization"])
        self.assertEqual(self.config["default_view"], "overview")
        self.assertEqual(len({view["id"] for view in self.config["views"]}), len(ids))

        app_source = legacy_file("App.tsx")
        for view in self.config["views"]:
            self.assertTrue(view["label"], view)
            self.assertTrue(view["subtitle"], view)
            if app_source:
                self.assertIn(f"id: '{view['id']}'", app_source, view["id"])
                self.assertIn(f"label: '{view['label']}'", app_source, view["label"])

    def test_view_subtitles_match_the_legacy_header(self) -> None:
        app_source = legacy_file("App.tsx")
        if app_source is None:
            self.skipTest("legacy App.tsx removed")
        for view in self.config["views"]:
            self.assertIn(view["subtitle"], app_source, view["id"])

    def test_upload_config_matches_fileupload_component(self) -> None:
        upload = self.config["upload"]
        self.assertEqual(upload["extensions"], ["xlsx", "xls", "csv"])
        self.assertEqual(upload["accept"], ".xlsx,.xls,.csv")

        source = legacy_file("components/FileUpload.tsx")
        if source is None:
            self.assertEqual(upload["title"], "Drag & drop your file here")
            self.assertEqual(upload["hint"], "or click to browse")
            return

        self.assertIn("['xlsx', 'xls', 'csv']", source)
        self.assertIn(upload["title"], source)
        self.assertIn(upload["hint"], source)
        self.assertIn("Supports: .xlsx, .xls, .csv", source)
        self.assertIn("Drop your file here", source)
        self.assertIn("Please upload an Excel (.xlsx, .xls) or CSV file", source)
        self.assertIn("The file appears to be empty", source)

    def test_probability_modes_match_the_legacy_tabs(self) -> None:
        ids = [mode["id"] for mode in self.config["probability_modes"]]
        self.assertEqual(ids, ["basic", "binomial", "poisson", "normal", "correlation"])

        source = legacy_file("components/Probability.tsx")
        if source:
            for mode in self.config["probability_modes"]:
                self.assertIn(f"id: '{mode['id']}'", source, mode["id"])
                self.assertIn(f"label: '{mode['label']}'", source, mode["label"])

    def test_chart_types_match_the_legacy_tabs(self) -> None:
        ids = [chart["id"] for chart in self.config["chart_types"]]
        self.assertEqual(ids, ["bar", "line", "area", "pie", "scatter", "histogram"])

        source = legacy_file("components/Visualization.tsx")
        if source:
            for chart in self.config["chart_types"]:
                self.assertIn(f"id: '{chart['id']}'", source, chart["id"])

    def test_aggregations_match_the_legacy_select(self) -> None:
        ids = [aggregation["id"] for aggregation in self.config["aggregations"]]
        self.assertEqual(ids, ["sum", "avg", "count", "min", "max"])

        source = legacy_file("components/Visualization.tsx")
        if source:
            for aggregation in self.config["aggregations"]:
                self.assertIn(f'value="{aggregation["id"]}"', source, aggregation["id"])
            self.assertIn(f'value="{self.config["aggregations"][0]["id"]}"', source)


class TableConfigParityTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        cls.source = legacy_file("components/DataTable.tsx")

    def test_rows_per_page(self) -> None:
        expected = legacy_int(self.source, r"const rowsPerPage = (\d+)", 15)
        self.assertEqual(self.config["table"]["rows_per_page"], expected)
        self.assertEqual(expected, 15)

    def test_page_window(self) -> None:
        expected = legacy_int(self.source, r"Math\.min\((\d+), totalPages\)", 5)
        self.assertEqual(self.config["table"]["page_window"], expected)
        self.assertEqual(expected, 5)


class ChartConfigParityTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        cls.source = legacy_file("components/Visualization.tsx")

    def test_palette_matches_the_legacy_colors_array(self) -> None:
        expected = legacy_string_list(
            self.source,
            r"const COLORS = \[(.*?)\];",
            [
                "#6366f1", "#8b5cf6", "#a855f7", "#d946ef", "#ec4899",
                "#f43f5e", "#ef4444", "#f97316", "#f59e0b", "#eab308",
                "#84cc16", "#22c55e", "#10b981", "#14b8a6", "#06b6d4",
                "#0ea5e9", "#3b82f6", "#6366f1",
            ],
        )
        self.assertEqual(self.config["charts"]["palette"], expected)
        self.assertEqual(len(expected), 18)

    def test_category_cap(self) -> None:
        expected = legacy_int(self.source, r"\.slice\(0, (\d+)\); // Limit categories", 50)
        self.assertEqual(self.config["charts"]["max_categories"], expected)
        self.assertEqual(expected, 50)

    def test_scatter_cap(self) -> None:
        expected = legacy_int(self.source, r"\.slice\(0, (\d+)\); // Limit for performance", 500)
        self.assertEqual(self.config["charts"]["max_scatter_points"], expected)
        self.assertEqual(expected, 500)

    def test_histogram_bin_cap(self) -> None:
        expected = legacy_int(self.source, r"Math\.min\((\d+), Math\.ceil\(Math\.sqrt", 20)
        self.assertEqual(self.config["charts"]["max_histogram_bins"], expected)
        self.assertEqual(expected, 20)

    def test_pie_slice_cap(self) -> None:
        expected = legacy_int(self.source, r"chartData\.slice\(0, (\d+)\)", 12)
        self.assertEqual(self.config["charts"]["max_pie_slices"], expected)
        self.assertEqual(expected, 12)


class SampleDatasetConfigTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))

    def test_settings(self) -> None:
        settings = self.config["sample_dataset"]
        self.assertEqual(settings["rows"], 200)
        self.assertIsInstance(settings["seed"], int)
        self.assertEqual(settings["display_name"], "sample_sales_data.csv")
        self.assertEqual(Path(settings["source"]).name, "sample_sales_data.json")
        self.assertEqual(Path(settings["stats_source"]).name, "sample_stats.json")

    def test_row_count_matches_the_legacy_generator(self) -> None:
        source = legacy_file("components/DataOverview.tsx")
        expected = legacy_int(source, r"Array\.from\(\{ length: (\d+) \}", 200)
        self.assertEqual(self.config["sample_dataset"]["rows"], expected)

    def test_sample_column_names_match_the_legacy_generator(self) -> None:
        source = legacy_file("components/DataOverview.tsx")
        if source is None:
            self.skipTest("legacy DataOverview.tsx removed")
        for column in ("id", "product", "category", "region", "month", "sales", "quantity", "price", "rating", "inStock"):
            self.assertIn(f"{column}:", source, column)

    def test_feature_copy_is_preserved_from_the_legacy_overview(self) -> None:
        source = legacy_file("components/DataOverview.tsx")
        if source is None:
            self.skipTest("legacy DataOverview.tsx removed")
        for feature in self.config["features"]:
            self.assertIn(feature["title"], source, feature["title"])
            self.assertIn(feature["text"], source, feature["title"])

    def test_documented_feature_headings_appear_in_the_readme(self) -> None:
        readme = (REPO_ROOT / "README.md").read_text(encoding="utf-8")
        for heading in ("Statistical Analysis", "Data Visualization"):
            self.assertIn(heading, readme, heading)


if __name__ == "__main__":
    unittest.main()

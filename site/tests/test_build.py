"""Tests for the static site build (`site/build.py`) and its generated output.

These run the real builder into a temporary directory and assert on the
artifacts Render would publish: page structure, embedded build-time data, asset
references, cache-busting hashes, and reproducibility.
"""

from __future__ import annotations

import json
import re
import tempfile
import unittest
from pathlib import Path

# `_helpers` must be imported first: it puts `site/` on sys.path so the build
# modules resolve no matter which directory discovery was started from.
from _helpers import SITE_DIR, load_json

import build as build_module
import sample
import stats


class BuildTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls._tmp = tempfile.TemporaryDirectory(prefix="datalens-build-")
        cls.out = Path(cls._tmp.name) / "public"
        cls.manifest = build_module.build_site(output_dir=cls.out, quiet=True)
        cls.index = (cls.out / "index.html").read_text(encoding="utf-8")
        cls.not_found = (cls.out / "404.html").read_text(encoding="utf-8")
        cls.config = build_module.load_config()

    @classmethod
    def tearDownClass(cls) -> None:
        cls._tmp.cleanup()


class OutputStructureTest(BuildTestCase):
    def test_pages_are_written(self) -> None:
        for name in ("index.html", "404.html"):
            path = self.out / name
            self.assertTrue(path.is_file(), name)
            self.assertGreater(path.stat().st_size, 1000, name)

    def test_static_data_is_exported(self) -> None:
        for name in ("sample_sales_data.json", "sample_stats.json"):
            path = self.out / "data" / name
            self.assertTrue(path.is_file(), name)
            load_json(path)  # must parse

    def test_assets_are_copied(self) -> None:
        for relative in (
            "assets/css/styles.css",
            "assets/js/app.js",
            "assets/js/statistics.js",
            "assets/js/charts.js",
            "assets/js/aggregate.js",
            "assets/js/paging.js",
            "assets/js/parser.js",
            "assets/js/store.js",
            "assets/js/views/overview.js",
            "assets/js/views/table.js",
            "assets/js/views/stats.js",
            "assets/js/views/probability.js",
            "assets/js/views/visualization.js",
            "assets/img/favicon.svg",
            "assets/vendor/xlsx.full.min.js",
            "assets/vendor/xlsx.LICENSE",
        ):
            self.assertTrue((self.out / relative).is_file(), relative)

    def test_manifest_describes_output(self) -> None:
        manifest = load_json(self.out / "build-manifest.json")
        self.assertEqual({page["path"] for page in manifest["pages"]}, {"index.html", "404.html"})
        self.assertEqual(manifest["sampleDataset"]["rows"], 200)
        self.assertEqual(manifest["sampleDataset"]["columns"], 10)
        self.assertEqual(len(manifest["data"]), 2)
        for entry in manifest["assets"]:
            self.assertTrue((self.out / entry["path"]).is_file(), entry["path"])
            self.assertRegex(entry["sha256_10"], r"^[0-9a-f]{10}$")

    def test_build_is_reproducible(self) -> None:
        with tempfile.TemporaryDirectory(prefix="datalens-rebuild-") as other:
            second = Path(other) / "public"
            build_module.build_site(output_dir=second, quiet=True)

            first_files = {p.relative_to(self.out).as_posix(): p for p in self.out.rglob("*") if p.is_file()}
            second_files = {p.relative_to(second).as_posix(): p for p in second.rglob("*") if p.is_file()}
            self.assertEqual(sorted(first_files), sorted(second_files))

            for name, path in first_files.items():
                self.assertEqual(
                    path.read_bytes(),
                    second_files[name].read_bytes(),
                    f"{name} differs between identical builds",
                )

class GeneratedMarkupTest(BuildTestCase):
    def test_html_shell(self) -> None:
        self.assertTrue(self.index.startswith("<!doctype html>"))
        self.assertIn("<title>DataLens - Data Analysis Tool</title>", self.index)
        self.assertIn('<html lang="en">', self.index)
        self.assertIn('name="viewport"', self.index)

    def test_all_views_are_present(self) -> None:
        for view in self.config["views"]:
            self.assertIn(f'id="view-{view["id"]}"', self.index, view["id"])
            self.assertIn(f'data-tab="{view["id"]}"', self.index, view["id"])
            self.assertIn(f'data-title="{view["id"]}"', self.index, view["id"])
            self.assertIn(f'data-subtitle="{view["id"]}"', self.index, view["id"])
            self.assertIn(view["subtitle"], self.index)

    def test_default_view_is_the_only_visible_one(self) -> None:
        default = self.config["default_view"]
        self.assertNotIn(f'id="view-{default}" data-view="{default}" hidden', self.index)
        for view in self.config["views"]:
            if view["id"] == default:
                continue
            self.assertRegex(self.index, rf'id="view-{view["id"]}"[^>]*hidden')

    def test_icon_sprite_is_embedded(self) -> None:
        symbols = set(re.findall(r'<symbol id="icon-([a-z0-9-]+)"', self.index))
        self.assertEqual(len(symbols), len(build_module.available_icons()))
        for name in ("database", "menu", "x", "hash", "type", "bar-chart-3", "alert-triangle"):
            self.assertIn(name, symbols)

    def test_no_unrendered_template_syntax_leaks(self) -> None:
        for pattern in ("{{", "{%", "StrictUndefined", "ICONS["):
            self.assertNotIn(pattern, self.index)
            self.assertNotIn(pattern, self.not_found)

    def test_every_id_referenced_by_js_exists(self) -> None:
        js_files = list((SITE_DIR / "assets" / "js").rglob("*.js"))
        self.assertTrue(js_files)

        referenced = set()
        for path in js_files:
            referenced.update(re.findall(r"getElementById\(['\"]([^'\"]+)['\"]\)", path.read_text(encoding="utf-8")))

        present = set(re.findall(r'\bid="([^"]+)"', self.index))
        missing = sorted(referenced - present)
        self.assertEqual(missing, [], f"JS references ids missing from index.html: {missing}")

    def test_icons_used_by_js_are_in_the_sprite(self) -> None:
        js_text = "\n".join(
            path.read_text(encoding="utf-8") for path in (SITE_DIR / "assets" / "js").rglob("*.js")
        )

        # The client-rendered views build glyphs with `<use href="#icon-${name}">`,
        # so collect the names handed to the icon() helper and to iconName options.
        used = set()
        for call in re.findall(r"\bicon\(([^)]*)\)", js_text, re.S):
            # Only the first argument is the icon name; later ones are CSS classes
            # (ternaries such as `icon(numeric ? 'hash' : 'type')` yield both names).
            used.update(re.findall(r"'([a-z0-9-]+)'", call.split(",")[0]))
        used.update(re.findall(r"iconName: '([a-z0-9-]+)'", js_text))

        symbols = set(re.findall(r'<symbol id="icon-([a-z0-9-]+)"', self.index))
        self.assertTrue(used, "expected the client-rendered views to reference sprite icons")
        self.assertIn("hash", used)
        self.assertEqual(sorted(used - symbols), [], "JS references icons missing from the sprite")

    def test_asset_references_resolve(self) -> None:
        references = set(re.findall(r'(?:href|src)="((?:assets|data)/[^"?]+)', self.index))
        references |= set(re.findall(r'(?:href|src)="((?:assets)/[^"?]+)', self.not_found))
        self.assertTrue(references)
        for reference in sorted(references):
            self.assertTrue((self.out / reference).is_file(), reference)

    def test_asset_urls_are_cache_busted(self) -> None:
        versioned = re.findall(r'(?:href|src)="(assets/[^"]+\?v=[0-9a-f]{10})"', self.index)
        self.assertGreaterEqual(len(versioned), 4)
        for reference in versioned:
            path = reference.split("?v=")[0]
            self.assertTrue((self.out / path).is_file(), path)

    def test_scripts_and_stylesheet_are_wired(self) -> None:
        self.assertRegex(self.index, r'<script src="assets/vendor/xlsx\.full\.min\.js\?v=[0-9a-f]{10}" defer>')
        self.assertRegex(self.index, r'<script type="module" src="assets/js/app\.js\?v=[0-9a-f]{10}">')
        self.assertRegex(self.index, r'<link rel="stylesheet" href="assets/css/styles\.css\?v=[0-9a-f]{10}"\s*/>')
        self.assertRegex(self.index, r'<link rel="icon" type="image/svg\+xml" href="assets/img/favicon\.svg\?v=[0-9a-f]{10}"\s*/>')

    def test_upload_zones_accept_the_documented_formats(self) -> None:
        self.assertEqual(self.index.count('type="file"'), 2)
        self.assertIn('accept=".xlsx,.xls,.csv"', self.index)
        self.assertIn("Supports: .xlsx, .xls, .csv", self.index)

    def test_404_page(self) -> None:
        self.assertIn("404", self.not_found)
        self.assertIn('href="index.html"', self.not_found)
        self.assertIn('name="robots" content="noindex"', self.not_found)


class EmbeddedConfigTest(BuildTestCase):
    @classmethod
    def setUpClass(cls) -> None:
        super().setUpClass()
        match = re.search(r"window\.DATALENS_CONFIG = (\{.*?\});\n", cls.index, re.S)
        assert match, "DATALENS_CONFIG not found in index.html"
        cls.client_config = json.loads(match.group(1))

    def test_config_matches_site_json(self) -> None:
        self.assertEqual(self.client_config["name"], self.config["name"])
        self.assertEqual(self.client_config["defaultView"], self.config["default_view"])
        self.assertEqual([v["id"] for v in self.client_config["views"]], [v["id"] for v in self.config["views"]])
        self.assertEqual(self.client_config["table"]["rowsPerPage"], self.config["table"]["rows_per_page"])
        self.assertEqual(self.client_config["charts"]["palette"], self.config["charts"]["palette"])
        self.assertEqual(self.client_config["probabilityModes"], [m["id"] for m in self.config["probability_modes"]])
        self.assertEqual(self.client_config["chartTypes"], [c["id"] for c in self.config["chart_types"]])
        self.assertEqual(self.client_config["aggregations"], [a["id"] for a in self.config["aggregations"]])

    def test_upload_config_includes_error_copy(self) -> None:
        upload = self.client_config["upload"]
        self.assertEqual(upload["extensions"], ["xlsx", "xls", "csv"])
        self.assertEqual(upload["dropTitle"], "Drop your file here")
        self.assertIn("unsupported", upload["errors"])
        self.assertIn("empty", upload["errors"])

    def test_sample_dataset_points_at_static_json(self) -> None:
        sample_config = self.client_config["sampleDataset"]
        self.assertEqual(sample_config["url"], "data/sample_sales_data.json")
        self.assertTrue((self.out / sample_config["url"]).is_file())
        self.assertEqual(sample_config["displayName"], "sample_sales_data.csv")


class ExportedDataTest(BuildTestCase):
    @classmethod
    def setUpClass(cls) -> None:
        super().setUpClass()
        cls.exported_rows = load_json(cls.out / "data" / "sample_sales_data.json")
        cls.exported_stats = load_json(cls.out / "data" / "sample_stats.json")

    def test_exported_rows_match_the_generator(self) -> None:
        self.assertEqual(self.exported_rows, sample.generate_sample_data())

    def test_exported_stats_match_the_engine(self) -> None:
        rows = self.exported_rows
        columns = list(rows[0])

        self.assertEqual(self.exported_stats["columns"], columns)
        self.assertEqual(self.exported_stats["rowCount"], len(rows))
        self.assertEqual(self.exported_stats["columnCount"], len(columns))
        self.assertEqual(self.exported_stats["fileName"], "sample_sales_data.csv")
        self.assertEqual(self.exported_stats["numericColumns"], stats.numeric_columns(rows, columns))

        expected_summary = stats.dataset_summary(rows, columns)
        self.assertEqual(self.exported_stats["summary"], expected_summary)

        for column in columns:
            with self.subTest(column=column):
                actual = next(s for s in self.exported_stats["columnStats"] if s["name"] == column)
                self.assertEqual(actual, stats.calculate_column_stats(rows, column))

    def test_stats_embedded_in_the_page_match_the_json_file(self) -> None:
        match = re.search(r'<script type="application/json" id="sample-stats">(.*?)</script>', self.index, re.S)
        self.assertIsNotNone(match)
        embedded = json.loads(match.group(1).replace("<\\/", "</"))
        self.assertEqual(embedded, self.exported_stats)

    def test_json_script_payload_is_safe_to_embed(self) -> None:
        match = re.search(r'<script type="application/json" id="sample-stats">(.*?)</script>', self.index, re.S)
        self.assertNotIn("</script", match.group(1).lower())


class ProbabilityDefaultsTest(BuildTestCase):
    def test_defaults_match_the_legacy_react_component(self) -> None:
        defaults = build_module.probability_defaults()

        # Probability.tsx initial state: binomial n=10 k=5 p=0.5
        self.assertEqual(defaults["binomial"]["percent"], "24.6094%")
        self.assertEqual(defaults["binomial"]["expected"], "5.0000")
        self.assertEqual(defaults["binomial"]["std_dev"], "1.5811")

        # Poisson lambda=5 k=3
        self.assertEqual(defaults["poisson"]["percent"], "14.0374%")
        self.assertEqual(defaults["poisson"]["expected"], "5")
        self.assertEqual(defaults["poisson"]["std_dev"], "2.2361")

        # Normal x=0 mu=0 sigma=1
        self.assertEqual(defaults["normal"]["z_score"], "0.0000")
        self.assertEqual(defaults["normal"]["pdf"], "0.398942")

        # Basic probability with total=0 renders a bare 0, exactly like React.
        self.assertEqual(defaults["basic"]["percent"], "0%")
        self.assertEqual(defaults["basic"]["decimal"], "0")

        # C(0,0) = P(0,0) = 1
        self.assertEqual(defaults["counting"]["combinations"], "1")
        self.assertEqual(defaults["counting"]["permutations"], "1")

    def test_defaults_are_prerendered_into_the_page(self) -> None:
        self.assertIn('<p class="result-value" id="prob-binomial-percent">24.6094%</p>', self.index)
        self.assertIn('<p class="result-value" id="prob-pdf">0.398942</p>', self.index)
        self.assertIn('<p class="result-value" id="prob-basic-percent">0%</p>', self.index)

    def test_binomial_inputs_are_prefilled(self) -> None:
        self.assertRegex(self.index, r'id="prob-bin-n" min="1" value="10"')
        self.assertRegex(self.index, r'id="prob-bin-k" min="0" value="5"')
        self.assertRegex(self.index, r'id="prob-bin-p" min="0" max="1" step="0\.01" value="0\.5"')
        self.assertRegex(self.index, r'id="prob-lambda" min="0" step="0\.1" value="5\.0"')


class ConfigValidationTest(unittest.TestCase):
    def test_unknown_icon_fails_the_build(self) -> None:
        config = build_module.load_config()
        config["views"][0]["icon"] = "definitely-not-an-icon"
        with self.assertRaises(ValueError) as caught:
            build_module.validate_config(config)
        self.assertIn("definitely-not-an-icon", str(caught.exception))

    def test_shipped_config_is_valid(self) -> None:
        build_module.validate_config(build_module.load_config())

    def test_available_icons_are_parsed_from_the_sprite(self) -> None:
        icons = build_module.available_icons()
        self.assertIn("layout-dashboard", icons)
        self.assertIn("activity", icons)
        self.assertEqual(len(icons), len(set(icons)))


if __name__ == "__main__":
    unittest.main()

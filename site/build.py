#!/usr/bin/env python3
"""Static site builder for DataLens.

Renders the Jinja2 templates in ``site/templates`` into a dependency-free static
bundle (``site/public`` by default) that can be published on Render as a Static
Site.  The build is fully offline apart from installing Jinja2 itself:

    pip install -r requirements.txt
    python build.py

The build performs five jobs:

1. Export the bundled sample dataset as static JSON (``data/sample_sales_data.json``).
2. Pre-compute that dataset's column statistics with ``stats.py`` (``data/sample_stats.json``).
3. Copy the front-end assets (CSS, JS modules, vendored SheetJS, icons).
4. Render the application shell and every view template into ``index.html``.
5. Render a ``404.html`` and a ``build-manifest.json`` describing the output.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import shutil
import sys
from pathlib import Path
from typing import Any, Dict, List

try:
    from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape
except ImportError:  # pragma: no cover - friendly failure for a fresh checkout
    sys.stderr.write(
        "Jinja2 is required to build DataLens.\n"
        "  python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt\n"
    )
    raise SystemExit(1)

import jsfmt
import sample
import stats

SITE_ROOT = Path(__file__).resolve().parent
CONFIG_PATH = SITE_ROOT / "site.json"
TEMPLATE_DIR = SITE_ROOT / "templates"
ASSET_DIR = SITE_ROOT / "assets"

PAGE_TEMPLATES = [
    ("index.html.j2", "index.html"),
    ("404.html.j2", "404.html"),
]


def load_config(path: Path = CONFIG_PATH) -> Dict[str, Any]:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def make_environment() -> Environment:
    env = Environment(
        loader=FileSystemLoader(str(TEMPLATE_DIR)),
        autoescape=select_autoescape(["html", "xml", "j2"], default_for_string=True),
        undefined=StrictUndefined,
        trim_blocks=True,
        lstrip_blocks=True,
    )
    env.filters["json"] = _json_filter
    env.filters["thousands"] = _thousands_filter
    return env


def _json_filter(value: Any) -> str:
    """Serialize Python data for safe embedding inside a ``<script>`` tag."""
    return json.dumps(value, separators=(",", ":"), default=str).replace("</", "<\\/")


def _thousands_filter(value: Any) -> str:
    """``(1234).toLocaleString()`` in the original UI."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return str(value)
    return f"{value:,}"


def _digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:10]


def build_sample_dataset(config: Dict[str, Any], output_dir: Path) -> Dict[str, Any]:
    settings = config["sample_dataset"]
    rows = int(settings.get("rows", sample.DEFAULT_ROWS))
    seed = int(settings.get("seed", sample.DEFAULT_SEED))
    display_name = settings.get("display_name", sample.DISPLAY_NAME)

    data = sample.generate_sample_data(rows=rows, seed=seed)
    columns = list(data[0].keys())

    column_stats = [stats.calculate_column_stats(data, column) for column in columns]
    payload = {
        "fileName": display_name,
        "rowCount": len(data),
        "columnCount": len(columns),
        "columns": columns,
        "numericColumns": stats.numeric_columns(data, columns),
        "summary": stats.dataset_summary(data, columns),
        "columnStats": column_stats,
        "generatedBy": {"generator": "site/sample.py", "rows": rows, "seed": seed},
    }

    data_dir = output_dir / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    _write_json(data_dir / settings["source"].split("/")[-1], data)
    _write_json(data_dir / settings["stats_source"].split("/")[-1], payload)

    return payload


def _write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=False)
        handle.write("\n")


def copy_assets(output_dir: Path) -> List[Dict[str, str]]:
    target = output_dir / "assets"
    if target.exists():
        shutil.rmtree(target)
    shutil.copytree(ASSET_DIR, target)

    manifest = []
    for path in sorted(target.rglob("*")):
        if path.is_file():
            manifest.append(
                {
                    "path": f"assets/{path.relative_to(target).as_posix()}",
                    "sha256_10": _digest(path),
                    "bytes": path.stat().st_size,
                }
            )
    return manifest


def probability_defaults() -> Dict[str, Any]:
    """Pre-compute the calculator results shown on first paint.

    The inputs are the defaults hard-coded in ``src/components/Probability.tsx``;
    rendering their results at build time keeps the static page informative even
    before any JavaScript runs.
    """
    favorable, total = 0, 0
    n, r = 0, 0
    bin_n, bin_k, bin_p = 10, 5, 0.5
    poisson_lambda, poisson_k = 5.0, 3
    normal_x, normal_mean, normal_std = 0.0, 0.0, 1.0

    return {
        "basic": {
            "favorable": favorable,
            "total": total,
            "percent": f"{jsfmt.fixed(stats.probability(favorable, total) * 100, 4) if total > 0 else 0}%",
            "decimal": jsfmt.fixed(stats.probability(favorable, total), 6) if total > 0 else "0",
        },
        "counting": {
            "n": n,
            "r": r,
            "combinations": jsfmt.locale_string(stats.combinations(n, r)) if n >= r and n <= 170 else "N/A",
            "permutations": jsfmt.locale_string(stats.permutations(n, r)) if n >= r and n <= 170 else "N/A",
        },
        "binomial": {
            "n": bin_n,
            "k": bin_k,
            "p": bin_p,
            "percent": f"{jsfmt.fixed(stats.binomial_probability(bin_n, bin_k, bin_p) * 100, 4)}%",
            "expected": jsfmt.fixed(bin_n * bin_p, 4),
            "std_dev": jsfmt.fixed(math.sqrt(bin_n * bin_p * (1 - bin_p)), 4),
        },
        "poisson": {
            "lambda": poisson_lambda,
            "k": poisson_k,
            "percent": f"{jsfmt.fixed(stats.poisson_probability(poisson_lambda, poisson_k) * 100, 4)}%",
            "expected": jsfmt.locale_string(poisson_lambda),
            "std_dev": jsfmt.fixed(math.sqrt(poisson_lambda), 4),
        },
        "normal": {
            "x": normal_x,
            "mean": normal_mean,
            "std": normal_std,
            "z_score": jsfmt.fixed(stats.z_score(normal_x, normal_mean, normal_std), 4),
            "pdf": jsfmt.fixed(stats.normal_pdf(normal_x, normal_mean, normal_std), 6),
        },
    }


def client_config(config: Dict[str, Any]) -> Dict[str, Any]:
    """The slice of ``site.json`` the front-end needs at runtime."""
    upload = dict(config["upload"])
    upload["dropTitle"] = "Drop your file here"
    upload["errors"] = {
        "unsupported": "Please upload an Excel (.xlsx, .xls) or CSV file",
        "empty": "The file appears to be empty",
        "generic": "Error processing file",
    }

    sample_settings = config["sample_dataset"]
    return {
        "name": config["name"],
        "tagline": config["tagline"],
        "defaultView": config.get("default_view", "overview"),
        "views": [
            {"id": view["id"], "label": view["label"], "title": view["title"], "subtitle": view["subtitle"]}
            for view in config["views"]
        ],
        "upload": upload,
        "sampleDataset": {
            "url": f"data/{Path(sample_settings['source']).name}",
            "displayName": sample_settings.get("display_name", sample.DISPLAY_NAME),
            "statsSelector": "#sample-stats",
        },
        "table": {
            "rowsPerPage": config["table"]["rows_per_page"],
            "pageWindow": config["table"]["page_window"],
        },
        "charts": {
            "maxCategories": config["charts"]["max_categories"],
            "maxPieSlices": config["charts"]["max_pie_slices"],
            "maxScatterPoints": config["charts"]["max_scatter_points"],
            "maxHistogramBins": config["charts"]["max_histogram_bins"],
            "palette": config["charts"]["palette"],
        },
        "probabilityModes": [mode["id"] for mode in config["probability_modes"]],
        "chartTypes": [chart["id"] for chart in config["chart_types"]],
        "aggregations": [aggregation["id"] for aggregation in config["aggregations"]],
    }


def available_icons() -> List[str]:
    """Icon names defined by ``templates/macros/icons.html.j2``."""
    source = (TEMPLATE_DIR / "macros" / "icons.html.j2").read_text(encoding="utf-8")
    block = source.split("{% set ICONS = {", 1)[1].split("} %}", 1)[0]
    return re.findall(r"^\s*'([a-z0-9-]+)':", block, flags=re.MULTILINE)


def validate_config(config: Dict[str, Any]) -> None:
    """Fail the build early when config references an icon that isn't bundled."""
    icons = set(available_icons())
    referenced = [
        ("views", entry.get("id"), entry.get("icon")) for entry in config.get("views", [])
    ]
    referenced += [
        ("features", entry.get("title"), entry.get("icon")) for entry in config.get("features", [])
    ]
    referenced += [
        ("probability_modes", entry.get("id"), entry.get("icon"))
        for entry in config.get("probability_modes", [])
    ]
    referenced += [
        ("chart_types", entry.get("id"), entry.get("icon")) for entry in config.get("chart_types", [])
    ]

    unknown = [(group, key, icon) for group, key, icon in referenced if icon not in icons]
    if unknown:
        details = ", ".join(f"{group}.{key}='{icon}'" for group, key, icon in unknown)
        raise ValueError(f"site.json references icons missing from the sprite: {details}")


def build_site(
    config_path: Path = CONFIG_PATH,
    output_dir: Path | None = None,
    quiet: bool = False,
) -> Dict[str, Any]:
    config = load_config(config_path)
    validate_config(config)
    out = Path(output_dir or (SITE_ROOT / config.get("output_dir", "public"))).resolve()

    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True, exist_ok=True)

    sample_payload = build_sample_dataset(config, out)
    asset_manifest = copy_assets(out)

    env = make_environment()
    hashed = {entry["path"]: entry["sha256_10"] for entry in asset_manifest}

    def asset_url(relative_path: str) -> str:
        key = f"assets/{relative_path.lstrip('/')}"
        digest = hashed.get(key)
        return f"{key}?v={digest}" if digest else key

    context = {
        "site": config,
        "views": config["views"],
        "default_view": config.get("default_view", "overview"),
        "sample": sample_payload,
        "sample_data_file": Path(config["sample_dataset"]["source"]).name,
        "client_config": client_config(config),
        "defaults": probability_defaults(),
        "asset_url": asset_url,
        "assets": asset_manifest,
        "build": {
            "generator": "DataLens static site builder (Python 3.11 + Jinja2)",
            "python": sys.version.split()[0],
            "jinja2": _jinja_version(),
        },
    }

    rendered: List[Dict[str, Any]] = []
    for template_name, output_name in PAGE_TEMPLATES:
        html = env.get_template(template_name).render(**context)
        destination = out / output_name
        destination.write_text(html, encoding="utf-8")
        rendered.append(
            {
                "template": f"templates/{template_name}",
                "path": output_name,
                "bytes": destination.stat().st_size,
                "sha256_10": _digest(destination),
            }
        )

    manifest = {
        "pages": rendered,
        "assets": asset_manifest,
        "data": [
            {"path": f"data/{Path(config['sample_dataset']['source']).name}"},
            {"path": f"data/{Path(config['sample_dataset']['stats_source']).name}"},
        ],
        "sampleDataset": {
            "rows": sample_payload["rowCount"],
            "columns": sample_payload["columnCount"],
            "numericColumns": len(sample_payload["numericColumns"]),
        },
    }
    _write_json(out / "build-manifest.json", manifest)

    if not quiet:
        _report(out, manifest)

    return manifest


def _jinja_version() -> str:
    try:
        import jinja2

        return jinja2.__version__
    except Exception:  # pragma: no cover
        return "unknown"


def _report(out: Path, manifest: Dict[str, Any]) -> None:
    pages = manifest["pages"]
    assets = manifest["assets"]
    total = sum(p["bytes"] for p in pages) + sum(a["bytes"] for a in assets)
    print(f"Built DataLens static site -> {out}")
    for page in pages:
        print(f"  page   {page['path']:<16} {page['bytes']:>8,} bytes")
    for entry in manifest["data"]:
        print(f"  data   {entry['path']}")
    print(f"  assets {len(assets)} files")
    print(f"  total  {total:,} bytes")


def main(argv: List[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build the static DataLens site.")
    parser.add_argument("--output", type=Path, default=None, help="output directory")
    parser.add_argument("--config", type=Path, default=CONFIG_PATH, help="site config JSON")
    parser.add_argument("--quiet", action="store_true", help="suppress the build summary")
    args = parser.parse_args(argv)

    build_site(config_path=args.config, output_dir=args.output, quiet=args.quiet)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

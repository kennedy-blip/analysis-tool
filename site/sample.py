"""Deterministic generator for the bundled ``sample_sales_data`` dataset.

The legacy app created its demo rows in the browser with ``Math.random()``
(``DataOverview.generateSampleData``), so the dataset changed on every click and
could not be tested.  This module reproduces the *same shape* -- 200 rows, the
same ten columns, the same value ranges and the same per-row draw order -- but
from a seeded PRNG so the exported JSON is byte-for-byte reproducible and can be
asserted against in the test-suite.
"""

from __future__ import annotations

import math
import random
from typing import Any, Dict, List

CATEGORIES = ["Electronics", "Clothing", "Food", "Books", "Sports", "Home", "Beauty", "Toys"]
REGIONS = ["North", "South", "East", "West", "Central"]
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

COLUMNS = [
    "id",
    "product",
    "category",
    "region",
    "month",
    "sales",
    "quantity",
    "price",
    "rating",
    "inStock",
]

DEFAULT_ROWS = 200
DEFAULT_SEED = 20260101
DISPLAY_NAME = "sample_sales_data.csv"


def js_round(value: float) -> int:
    """``Math.round`` -- halves go towards +Infinity, unlike Python's banker's rounding."""
    return math.floor(value + 0.5)


def js_product_name(index: int) -> str:
    """``Product ${String.fromCharCode(65 + (i % 26))}${Math.floor(i / 26) + 1}``."""
    letter = chr(65 + (index % 26))
    return f"Product {letter}{index // 26 + 1}"


def generate_sample_data(rows: int = DEFAULT_ROWS, seed: int = DEFAULT_SEED) -> List[Dict[str, Any]]:
    rng = random.Random(seed)
    data: List[Dict[str, Any]] = []

    for i in range(rows):
        category = CATEGORIES[math.floor(rng.random() * len(CATEGORIES))]
        region = REGIONS[math.floor(rng.random() * len(REGIONS))]
        month = MONTHS[math.floor(rng.random() * len(MONTHS))]
        sales = js_round(rng.random() * 10000 + 500)
        quantity = math.floor(rng.random() * 100 + 1)
        price = js_round((rng.random() * 200 + 10) * 100) / 100
        rating = js_round((rng.random() * 4 + 1) * 10) / 10
        in_stock = "Yes" if rng.random() > 0.2 else "No"

        data.append(
            {
                "id": i + 1,
                "product": js_product_name(i),
                "category": category,
                "region": region,
                "month": month,
                "sales": sales,
                "quantity": quantity,
                "price": price,
                "rating": rating,
                "inStock": in_stock,
            }
        )

    return data

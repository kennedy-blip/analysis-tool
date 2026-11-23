"""Statistics engine for the static DataLens build.

This module is a line-by-line Python port of ``src/utils/statistics.ts`` from the
legacy React/Vite application.  The formulas, edge cases and tie-breaking rules
are deliberately identical so that the statically generated reference data
matches what the original app computed in the browser.

Behaviour that is intentionally mirrored from JavaScript:

* ``variance`` is the *population* variance (divides by ``n``).
* ``quartile`` uses linear interpolation (NumPy's ``linear`` method).
* ``skewness`` / ``kurtosis`` use the sample-adjusted estimators and return
  ``0`` for tiny samples or zero standard deviation.
* ``factorial``-based helpers return ``inf`` above ``n = 170`` because the
  original JavaScript implementation overflowed a double there.
* ``most_common`` / ``least_common`` come from a descending-count sort that is
  stable in first-seen order, matching ``Array.prototype.sort``.
"""

from __future__ import annotations

import math
from typing import Any, Dict, Iterable, List, Optional, Sequence, Union

Number = Union[int, float]
CellValue = Union[str, int, float, bool, None]

# JavaScript doubles overflow to Infinity above 170!
_MAX_FACTORIAL = 170

_COLUMN_TYPES = ("numeric", "string", "boolean", "mixed")


def is_missing(value: Any) -> bool:
    """``v !== null && v !== undefined && v !== ''`` in the original code."""
    return value is None or value == ""


def to_number(value: Any) -> Optional[float]:
    """Mirror JavaScript's ``Number(value)`` for the cell values we accept."""
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return 1.0 if value else 0.0
    if isinstance(value, (int, float)):
        result = float(value)
        return None if math.isnan(result) else result
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        try:
            result = float(text)
        except ValueError:
            return None
        return None if math.isnan(result) else result
    return None


def get_column_type(values: Sequence[CellValue]) -> str:
    present = [v for v in values if not is_missing(v)]
    if not present:
        return "string"

    types = set()
    for value in present:
        if isinstance(value, bool):
            types.add("boolean")
        elif to_number(value) is not None:
            types.add("numeric")
        else:
            types.add("string")

    if len(types) == 1:
        return next(iter(types))
    return "mixed"


def mean(values: Sequence[Number]) -> float:
    if not values:
        return 0.0
    return sum(float(v) for v in values) / len(values)


def median(values: Sequence[Number]) -> float:
    if not values:
        return 0.0
    ordered = sorted(float(v) for v in values)
    mid = len(ordered) // 2
    if len(ordered) % 2 != 0:
        return ordered[mid]
    return (ordered[mid - 1] + ordered[mid]) / 2


def mode(values: Sequence[Union[Number, str]]) -> Optional[Union[Number, str]]:
    """Most frequent value; ties resolve to the first inserted key."""
    if not values:
        return None

    frequency: Dict[str, int] = {}
    for value in values:
        key = _js_string(value)
        frequency[key] = frequency.get(key, 0) + 1

    max_freq = 0
    mode_value: Optional[str] = None
    # Object.entries order decides ties (see js_object_entries).
    for key, freq in js_object_entries(frequency):
        if freq > max_freq:
            max_freq = freq
            mode_value = key

    if mode_value is None:
        return None

    numeric = to_number(mode_value)
    return _js_number_out(numeric) if numeric is not None else mode_value


def variance(values: Sequence[Number]) -> float:
    if not values:
        return 0.0
    avg = mean(values)
    return sum((float(v) - avg) ** 2 for v in values) / len(values)


def std_dev(values: Sequence[Number]) -> float:
    return math.sqrt(variance(values))


def quartile(values: Sequence[Number], q: float) -> float:
    ordered = sorted(float(v) for v in values)
    if not ordered:
        return 0.0
    pos = (len(ordered) - 1) * q
    base = math.floor(pos)
    rest = pos - base
    if base + 1 < len(ordered):
        return ordered[base] + rest * (ordered[base + 1] - ordered[base])
    return ordered[base]


def skewness(values: Sequence[Number]) -> float:
    n = len(values)
    if n < 3:
        return 0.0
    avg = mean(values)
    std = std_dev(values)
    if std == 0:
        return 0.0
    total = sum(((float(v) - avg) / std) ** 3 for v in values)
    return (n / ((n - 1) * (n - 2))) * total


def kurtosis(values: Sequence[Number]) -> float:
    n = len(values)
    if n < 4:
        return 0.0
    avg = mean(values)
    std = std_dev(values)
    if std == 0:
        return 0.0
    total = sum(((float(v) - avg) / std) ** 4 for v in values)
    return ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * total - (
        3 * (n - 1) ** 2
    ) / ((n - 2) * (n - 3))


def calculate_column_stats(data: Sequence[Dict[str, CellValue]], column_name: str) -> Dict[str, Any]:
    values = [row.get(column_name) for row in data]
    column_type = get_column_type(values)
    present = [v for v in values if not is_missing(v)]
    unique_values = {_js_string(v) for v in present}

    stats: Dict[str, Any] = {
        "name": column_name,
        "type": column_type,
        "count": len(data),
        "missing": len(values) - len(present),
        "unique": len(unique_values),
    }

    if column_type in ("numeric", "mixed"):
        numeric_values = [n for n in (to_number(v) for v in present) if n is not None]
        if numeric_values:
            q1 = quartile(numeric_values, 0.25)
            q3 = quartile(numeric_values, 0.75)
            stats.update(
                {
                    "mean": mean(numeric_values),
                    "median": median(numeric_values),
                    "mode": mode(numeric_values),
                    "min": min(numeric_values),
                    "max": max(numeric_values),
                    "range": max(numeric_values) - min(numeric_values),
                    "sum": sum(numeric_values),
                    "variance": variance(numeric_values),
                    "stdDev": std_dev(numeric_values),
                    "q1": q1,
                    "q3": q3,
                    "iqr": q3 - q1,
                    "skewness": skewness(numeric_values),
                    "kurtosis": kurtosis(numeric_values),
                }
            )

    if column_type in ("string", "mixed"):
        frequency: Dict[str, int] = {}
        for value in present:
            key = _js_string(value)
            frequency[key] = frequency.get(key, 0) + 1

        # Object.entries(...).sort((a, b) => b[1] - a[1]) -- V8's sort is stable,
        # so equal counts keep the JS key order computed above.
        ordered = sorted(js_object_entries(frequency), key=lambda entry: -entry[1])
        if ordered:
            stats["mostCommon"] = ordered[0][0]
            stats["leastCommon"] = ordered[-1][0]

    return stats


def dataset_summary(data: Sequence[Dict[str, CellValue]], columns: Sequence[str]) -> Dict[str, Any]:
    column_stats = [calculate_column_stats(data, column) for column in columns]
    numeric_columns = [s for s in column_stats if s["type"] == "numeric"]
    total_missing = sum(s["missing"] for s in column_stats)
    total_cells = len(data) * len(columns)
    return {
        "totalRows": len(data),
        "totalColumns": len(columns),
        "numericColumns": len(numeric_columns),
        "categoricalColumns": len(column_stats) - len(numeric_columns),
        "missingValues": total_missing,
        "missingPercent": f"{(total_missing / total_cells) * 100:.2f}" if total_cells else "0",
    }


# --------------------------------------------------------------------------- #
# Probability helpers
# --------------------------------------------------------------------------- #
def probability(favorable: float, total: float) -> float:
    if total == 0:
        return 0.0
    return favorable / total


def factorial(n: int) -> float:
    if n <= 1:
        return 1.0
    if n > _MAX_FACTORIAL:
        return math.inf
    result = 1.0
    for i in range(2, n + 1):
        result *= i
    return result


def combinations(n: int, r: int) -> float:
    if r > n:
        return 0.0
    return factorial(n) / (factorial(r) * factorial(n - r))


def permutations(n: int, r: int) -> float:
    if r > n:
        return 0.0
    return factorial(n) / factorial(n - r)


def binomial_probability(n: int, k: int, p: float) -> float:
    return combinations(n, k) * (p ** k) * ((1 - p) ** (n - k))


def poisson_probability(lam: float, k: int) -> float:
    return (lam ** k) * math.exp(-lam) / factorial(k)


def normal_pdf(x: float, mean_: float, std_dev_: float) -> float:
    coefficient = 1 / (std_dev_ * math.sqrt(2 * math.pi))
    exponent = -0.5 * ((x - mean_) / std_dev_) ** 2
    return coefficient * math.exp(exponent)


def z_score(value: float, mean_: float, std_dev_: float) -> float:
    if std_dev_ == 0:
        return 0.0
    return (value - mean_) / std_dev_


def correlation(x_values: Sequence[Number], y_values: Sequence[Number]) -> float:
    if len(x_values) != len(y_values) or not x_values:
        return 0.0
    mean_x = mean(x_values)
    mean_y = mean(y_values)

    numerator = 0.0
    denom_x = 0.0
    denom_y = 0.0
    for x, y in zip(x_values, y_values):
        dx = float(x) - mean_x
        dy = float(y) - mean_y
        numerator += dx * dy
        denom_x += dx * dx
        denom_y += dy * dy

    denominator = math.sqrt(denom_x * denom_y)
    if denominator == 0:
        return 0.0
    return numerator / denominator


def covariance(x_values: Sequence[Number], y_values: Sequence[Number]) -> float:
    if len(x_values) != len(y_values) or not x_values:
        return 0.0
    mean_x = mean(x_values)
    mean_y = mean(y_values)
    total = sum(
        (float(x) - mean_x) * (float(y) - mean_y) for x, y in zip(x_values, y_values)
    )
    return total / len(x_values)


def numeric_columns(data: Sequence[Dict[str, CellValue]], columns: Iterable[str]) -> List[str]:
    """Columns with at least one numeric value, as used by the Probability and
    Visualization views in the original app."""
    result = []
    for column in columns:
        values = [row.get(column) for row in data if not is_missing(row.get(column))]
        if any(to_number(v) is not None for v in values):
            result.append(column)
    return result


# --------------------------------------------------------------------------- #
# JavaScript compatibility helpers
# --------------------------------------------------------------------------- #
def _is_integer_index(key: str) -> bool:
    """True for keys JavaScript treats as integer indices (canonical array indices).

    ``OrdinaryOwnPropertyKeys`` lists those first, in ascending numeric order,
    before the remaining string keys in insertion order.  ``Object.entries`` on
    the frequency maps therefore does *not* preserve insertion order when the
    values are whole numbers -- which decides ``mode`` ties.
    """
    if not key:
        return False
    try:
        number = float(key)
    except ValueError:
        return False
    if number != int(number) or not 0 <= number < 2 ** 32 - 1:
        return False
    return str(int(number)) == key


def js_object_entries(frequency: Dict[str, int]) -> List[tuple]:
    """``Object.entries(frequency)`` ordering: integer indices first (ascending)."""
    indices = sorted((key for key in frequency if _is_integer_index(key)), key=int)
    others = [key for key in frequency if not _is_integer_index(key)]
    return [(key, frequency[key]) for key in [*indices, *others]]


def _js_string(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, float):
        if value.is_integer():
            return str(int(value))
        return repr(value)
    return str(value)


def _js_number_out(value: float) -> Number:
    """Return an int when JavaScript would print an integral double."""
    return int(value) if float(value).is_integer() else value

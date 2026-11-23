"""JavaScript-compatible number formatting.

The legacy UI formatted every number with ``Number.prototype.toFixed`` and
``Number.prototype.toLocaleString``.  The static site pre-computes the default
calculator results and the sample dataset summary at build time, so those values
have to be rendered exactly the way the browser rendered them.

Two V8 behaviours are reproduced here (both verified against a real JS engine by
``tests/test_jsfmt.py``, using ``tests/jsfmt_expectations.json``):

* ``toFixed`` rounds the **exact binary value** of the double, half away from
  zero -- so ``(1.005).toFixed(2)`` is ``"1.00"`` (the double sits just below
  the tie) while ``(0.12345).toFixed(4)`` is ``"0.1235"`` (just above it).
  A zero result keeps the sign of a negative input (``"-0.0000"``), except for
  negative zero itself, which JavaScript prints as ``0``.  Magnitudes of 1e21
  and above fall back to ``String(value)``.
* ``toLocaleString`` groups the **shortest round-trip decimal** of the double,
  which is why ``(9.999999e20).toLocaleString()`` is
  ``"999,999,900,000,000,000,000"`` rather than the exact binary expansion.
"""

from __future__ import annotations

import math
import re
from decimal import Decimal, ROUND_HALF_UP
from typing import Union

Number = Union[int, float]

# ``toFixed`` falls back to ``String(value)`` from here upwards.
_EXPONENTIAL_THRESHOLD = 1e21


def js_number_to_string(value: Number) -> str:
    """``String(value)`` for a JS number (shortest round-trip representation)."""
    number = float(value)

    if math.isnan(number):
        return "NaN"
    if math.isinf(number):
        return "Infinity" if number > 0 else "-Infinity"
    if number == 0:
        return "-0" if math.copysign(1.0, number) < 0 else "0"

    digits = Decimal(repr(abs(number)))
    if -6 <= digits.adjusted() < 21:
        text = format(digits, "f")
        if "." in text:
            text = text.rstrip("0").rstrip(".")
        return f"-{text}" if number < 0 else text

    # Exponential form: Python and JavaScript differ only in exponent padding.
    return re.sub(r"e([+-])0*(\d+)$", r"e\1\2", repr(number))


def fixed(value: Number, digits: int = 4) -> str:
    """``value.toFixed(digits)``."""
    number = float(value)

    if math.isnan(number):
        return "NaN"
    if math.isinf(number):
        return "Infinity" if number > 0 else "-Infinity"
    if abs(number) >= _EXPONENTIAL_THRESHOLD:
        return js_number_to_string(number)

    scale = Decimal(10) ** digits
    rounded = (Decimal(number) * scale).quantize(Decimal(1), rounding=ROUND_HALF_UP)

    if rounded == 0:
        # String(-0) is "0", so negative zero has no sign to preserve.
        sign = "-" if number < 0 else ""
        return f"{sign}{0:.{digits}f}"

    quantized = rounded / scale
    return f"{quantized:.{digits}f}" if digits else str(int(quantized))


def locale_string(value: Number, maximum_fraction_digits: int = 3) -> str:
    """``value.toLocaleString()`` with the default ``en-US`` grouping."""
    number = float(value)

    if math.isnan(number):
        return "NaN"
    if math.isinf(number):
        return "Infinity" if number > 0 else "-Infinity"

    negative = math.copysign(1.0, number) < 0
    shortest = Decimal(repr(abs(number)))

    if maximum_fraction_digits > 0:
        scale = Decimal(10) ** maximum_fraction_digits
        rounded = (shortest * scale).quantize(Decimal(1), rounding=ROUND_HALF_UP) / scale
    else:
        rounded = shortest.quantize(Decimal(1), rounding=ROUND_HALF_UP)

    text = format(rounded, "f")
    integer_part, _, fraction_part = text.partition(".")
    grouped = f"{int(integer_part):,}"
    if fraction_part:
        grouped = f"{grouped}.{fraction_part}"

    if rounded == 0:
        return "-0" if negative else "0"
    return f"-{grouped}" if negative else grouped


def stat_value(value: object) -> str:
    """``StatCard`` display rule from ``Statistics.tsx``.

    ``typeof value === 'number' ? (Number.isInteger(value) ? value : value.toFixed(4)) : value``
    -- integers print raw, with no thousands separators.
    """
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, str):
        return value
    if isinstance(value, int):
        return str(value)

    number = float(value)
    if math.isnan(number):
        return "NaN"
    if number.is_integer():
        return str(int(number))
    return fixed(number, 4)

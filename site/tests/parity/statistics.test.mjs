/**
 * Parity tests: `site/assets/js/statistics.js` vs the legacy
 * `src/utils/statistics.ts`, using the golden values captured by
 * `site/tests/golden/generate_golden.mjs`.
 *
 * Run with: node --test "site/tests/parity/*.test.mjs"
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import * as engine from '../../assets/js/statistics.js';

const golden = JSON.parse(
  fs.readFileSync(path.join(import.meta.dirname, '..', 'golden_stats.json'), 'utf8')
);

/** `JSON.stringify` writes Infinity as null and drops undefined keys. */
function assertMatches(actual, expected, label) {
  if (expected === null) {
    assert.ok(
      actual === undefined || actual === null || Number.isFinite(actual) === false,
      `${label}: expected Infinity/undefined, got ${actual}`
    );
    return;
  }
  if (typeof expected === 'number') {
    assert.ok(
      Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected)),
      `${label}: got ${actual}, expected ${expected}`
    );
    return;
  }
  assert.equal(actual, expected, label);
}

function assertStatsMatch(fixture, column) {
  const rows = golden.fixtures[fixture];
  const expected = golden.columnStats[fixture][column];
  const actual = engine.calculateColumnStats(rows, column);

  assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), `${fixture}.${column} keys`);
  for (const [key, value] of Object.entries(expected)) {
    assertMatches(actual[key], value, `${fixture}.${column}.${key}`);
  }
}

describe('column statistics parity', () => {
  for (const column of Object.keys(golden.columnStats.sales)) {
    it(`sales fixture: ${column}`, () => assertStatsMatch('sales', column));
  }
  for (const column of Object.keys(golden.columnStats.edge)) {
    it(`edge fixture: ${column}`, () => assertStatsMatch('edge', column));
  }
});

describe('function parity', () => {
  const rows = golden.fixtures.sales;
  const sales = rows.map((row) => row.sales);
  const quantity = rows.map((row) => row.quantity);
  const expected = golden.functions;

  const cases = {
    mean: () => engine.mean(sales),
    median: () => engine.median(sales),
    mode: () => engine.mode(sales),
    variance: () => engine.variance(sales),
    stdDev: () => engine.stdDev(sales),
    q1: () => engine.quartile(sales, 0.25),
    q3: () => engine.quartile(sales, 0.75),
    skewness: () => engine.skewness(sales),
    kurtosis: () => engine.kurtosis(sales),
    probability: () => engine.probability(3, 8),
    probabilityZeroTotal: () => engine.probability(3, 0),
    factorial10: () => engine.factorial(10),
    factorial171: () => engine.factorial(171),
    combinations_10_3: () => engine.combinations(10, 3),
    combinations_5_9: () => engine.combinations(5, 9),
    permutations_10_3: () => engine.permutations(10, 3),
    binomial_10_5_0p5: () => engine.binomialProbability(10, 5, 0.5),
    binomial_20_7_0p3: () => engine.binomialProbability(20, 7, 0.3),
    poisson_5_3: () => engine.poissonProbability(5, 3),
    poisson_2p5_0: () => engine.poissonProbability(2.5, 0),
    normalPDF_0_0_1: () => engine.normalPDF(0, 0, 1),
    normalPDF_90_80_5: () => engine.normalPDF(90, 80, 5),
    zScore_90_80_5: () => engine.zScore(90, 80, 5),
    zScoreZeroStd: () => engine.zScore(5, 5, 0),
    correlation_sales_qty: () => engine.correlation(sales, quantity),
    covariance_sales_qty: () => engine.covariance(sales, quantity),
    correlationMismatched: () => engine.correlation([1, 2, 3], [1, 2]),
    correlationConstant: () => engine.correlation([1, 1, 1], [1, 2, 3]),
  };

  for (const [name, run] of Object.entries(cases)) {
    it(name, () => assertMatches(run(), expected[name], name));
  }
});

describe('edge case parity', () => {
  const expected = golden.edgeCases;

  it('empty inputs', () => {
    assertMatches(engine.mean([]), expected.meanEmpty, 'mean([])');
    assertMatches(engine.median([]), expected.medianEmpty, 'median([])');
    assertMatches(engine.variance([]), expected.varianceEmpty, 'variance([])');
    assert.equal(engine.mode([]), undefined, 'mode([]) is undefined in the legacy engine');
  });

  it('median and mode rules', () => {
    assertMatches(engine.median([1, 2, 3, 4]), expected.medianEven, 'medianEven');
    assertMatches(engine.median([5, 1, 3]), expected.medianOdd, 'medianOdd');
    assert.equal(engine.mode(['b', 'a', 'b', 'a']), expected.modeTieFirstWins);
    assertMatches(engine.mode(['2', '2', '3']), expected.modeNumericStrings, 'modeNumericStrings');
  });

  it('small samples and zero dispersion', () => {
    assertMatches(engine.skewness([1, 2]), expected.skewnessTooSmall, 'skewnessTooSmall');
    assertMatches(engine.kurtosis([1, 2, 3]), expected.kurtosisTooSmall, 'kurtosisTooSmall');
    assertMatches(engine.skewness([4, 4, 4, 4]), expected.skewnessZeroStd, 'skewnessZeroStd');
    assertMatches(engine.kurtosis([4, 4, 4, 4, 4]), expected.kurtosisZeroStd, 'kurtosisZeroStd');
    assertMatches(engine.quartile([9], 0.75), expected.quartileSingle, 'quartileSingle');
  });

  it('column type detection', () => {
    assert.equal(engine.getColumnType([null, '']), expected.columnTypeEmpty);
    assert.equal(engine.getColumnType(['1', '2.5']), expected.columnTypeNumericStrings);
    assert.equal(engine.getColumnType(['1', 'abc']), expected.columnTypeMixed);
    assert.equal(engine.getColumnType([true, false]), expected.columnTypeBoolean);
  });

  it('whole-column edge cases', () => {
    for (const [name, rows, column] of [
      ['statsEmptyColumn', [{ a: null }, { a: '' }], 'a'],
      ['statsSingleRow', [{ a: 5 }], 'a'],
    ]) {
      const actual = engine.calculateColumnStats(rows, column);
      const want = expected[name];
      assert.deepEqual(Object.keys(actual).sort(), Object.keys(want).sort(), `${name} keys`);
      for (const [key, value] of Object.entries(want)) {
        assertMatches(actual[key], value, `${name}.${key}`);
      }
    }
  });

  it('numeric column detection helper', () => {
    const rows = golden.fixtures.sales;
    const columns = Object.keys(rows[0]);
    assert.deepEqual(engine.numericColumnsFor(rows, columns), [
      'id',
      'sales',
      'quantity',
      'price',
      'rating',
    ]);
  });

  it('dataset summary helper', () => {
    const rows = golden.fixtures.sales;
    const columns = Object.keys(rows[0]);
    const summary = engine.datasetSummary(rows, columns);
    assert.equal(summary.totalRows, rows.length);
    assert.equal(summary.totalColumns, columns.length);
    assert.equal(summary.numericColumns, 5);
    assert.equal(summary.categoricalColumns, columns.length - 5);
    assert.equal(summary.missingValues, 0);
    assert.equal(summary.missingPercent, '0.00');
  });
});

/**
 * Regenerates `site/tests/golden_stats.json` from the LEGACY implementation.
 *
 * The golden values are produced by importing `src/utils/statistics.ts` (the
 * React/Vite app that is being replaced) and running the fixtures below through
 * it.  Both new engines — the Python build-time port (`site/stats.py`) and the
 * browser port (`site/assets/js/statistics.js`) — are then asserted against this
 * file, so parity is measured against the original code rather than against
 * itself.
 *
 * Usage (Node >= 22.6, type stripping on by default from 22.18):
 *   node site/tests/golden/generate_golden.mjs
 *   # older 22.x:
 *   node --experimental-strip-types site/tests/golden/generate_golden.mjs
 *
 * While the legacy app still exists this file can be refreshed at any time;
 * after the old source is removed, golden_stats.json remains as the frozen
 * reference for the migrated calculators.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..');
const legacySource = path.join(repoRoot, 'src', 'utils', 'statistics.ts');

if (!fs.existsSync(legacySource)) {
  console.error(`Legacy source not found: ${legacySource}`);
  console.error('Golden values are already committed; regeneration needs the pre-migration app.');
  process.exit(1);
}

// `src/utils/statistics.ts` imports its types without an extension, which node's
// type stripper cannot resolve; inline them so the module loads standalone.
const patched = fs
  .readFileSync(legacySource, 'utf8')
  .replace(/^import\s+\{[^}]*\}\s+from\s+'\.\.\/types\/data';$/m, 'type DataRow = any;\ntype ColumnStats = any;');

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'datalens-golden-'));
const modulePath = path.join(scratch, 'legacy_statistics.ts');
fs.writeFileSync(modulePath, patched);

const legacy = await import(modulePath);

/** Sales-shaped fixture mirroring the columns the app analyses. */
const salesFixture = [
  { id: 1, product: 'A1', category: 'Electronics', region: 'North', month: 'Jan', sales: 5230, quantity: 41, price: 118.5, rating: 4.2, inStock: 'Yes' },
  { id: 2, product: 'B1', category: 'Clothing', region: 'South', month: 'Feb', sales: 1875, quantity: 12, price: 64.25, rating: 3.1, inStock: 'No' },
  { id: 3, product: 'C1', category: 'Food', region: 'East', month: 'Mar', sales: 9400, quantity: 88, price: 12.99, rating: 4.8, inStock: 'Yes' },
  { id: 4, product: 'D1', category: 'Electronics', region: 'West', month: 'Apr', sales: 3120, quantity: 25, price: 199.0, rating: 2.5, inStock: 'Yes' },
  { id: 5, product: 'E1', category: 'Books', region: 'North', month: 'May', sales: 760, quantity: 63, price: 33.75, rating: 3.9, inStock: 'No' },
  { id: 6, product: 'F1', category: 'Sports', region: 'Central', month: 'Jun', sales: 6410, quantity: 7, price: 88.2, rating: 4.5, inStock: 'Yes' },
  { id: 7, product: 'G1', category: 'Home', region: 'South', month: 'Jul', sales: 2205, quantity: 54, price: 145.6, rating: 3.3, inStock: 'Yes' },
  { id: 8, product: 'H1', category: 'Beauty', region: 'East', month: 'Aug', sales: 8100, quantity: 31, price: 27.4, rating: 4.1, inStock: 'No' },
];

/** Missing values, numeric strings, booleans and ties. */
const edgeFixture = [
  { empty: null, blanks: '', numericString: '12.5', flag: true, tied: 'alpha', single: 7 },
  { empty: '', blanks: null, numericString: '13.5', flag: false, tied: 'beta', single: 7 },
  { empty: 3, blanks: 'x', numericString: 'not-a-number', flag: true, tied: 'alpha', single: 7 },
  { empty: null, blanks: 'y', numericString: '14.5', flag: false, tied: 'beta', single: 7 },
];

const columnStatsFor = (rows) =>
  Object.fromEntries(Object.keys(rows[0]).map((column) => [column, legacy.calculateColumnStats(rows, column)]));

const sales = salesFixture.map((row) => row.sales);
const quantity = salesFixture.map((row) => row.quantity);

const payload = {
  meta: {
    description: 'Expected values captured from the legacy src/utils/statistics.ts implementation.',
    generatedFrom: 'src/utils/statistics.ts',
    generatedBy: 'site/tests/golden/generate_golden.mjs',
    node: process.version,
    generatedAt: new Date().toISOString().slice(0, 10),
  },
  fixtures: {
    sales: salesFixture,
    edge: edgeFixture,
  },
  columnStats: {
    sales: columnStatsFor(salesFixture),
    edge: columnStatsFor(edgeFixture),
  },
  functions: {
    mean: legacy.mean(sales),
    median: legacy.median(sales),
    mode: legacy.mode(sales),
    variance: legacy.variance(sales),
    stdDev: legacy.stdDev(sales),
    q1: legacy.quartile(sales, 0.25),
    q3: legacy.quartile(sales, 0.75),
    skewness: legacy.skewness(sales),
    kurtosis: legacy.kurtosis(sales),
    probability: legacy.probability(3, 8),
    probabilityZeroTotal: legacy.probability(3, 0),
    factorial10: legacy.factorial(10),
    factorial171: legacy.factorial(171),
    combinations_10_3: legacy.combinations(10, 3),
    combinations_5_9: legacy.combinations(5, 9),
    permutations_10_3: legacy.permutations(10, 3),
    binomial_10_5_0p5: legacy.binomialProbability(10, 5, 0.5),
    binomial_20_7_0p3: legacy.binomialProbability(20, 7, 0.3),
    poisson_5_3: legacy.poissonProbability(5, 3),
    poisson_2p5_0: legacy.poissonProbability(2.5, 0),
    normalPDF_0_0_1: legacy.normalPDF(0, 0, 1),
    normalPDF_90_80_5: legacy.normalPDF(90, 80, 5),
    zScore_90_80_5: legacy.zScore(90, 80, 5),
    zScoreZeroStd: legacy.zScore(5, 5, 0),
    correlation_sales_qty: legacy.correlation(sales, quantity),
    covariance_sales_qty: legacy.covariance(sales, quantity),
    correlationMismatched: legacy.correlation([1, 2, 3], [1, 2]),
    correlationConstant: legacy.correlation([1, 1, 1], [1, 2, 3]),
  },
  edgeCases: {
    meanEmpty: legacy.mean([]),
    medianEmpty: legacy.median([]),
    modeEmpty: legacy.mode([]),
    varianceEmpty: legacy.variance([]),
    medianEven: legacy.median([1, 2, 3, 4]),
    medianOdd: legacy.median([5, 1, 3]),
    modeTieFirstWins: legacy.mode(['b', 'a', 'b', 'a']),
    modeNumericStrings: legacy.mode(['2', '2', '3']),
    skewnessTooSmall: legacy.skewness([1, 2]),
    kurtosisTooSmall: legacy.kurtosis([1, 2, 3]),
    skewnessZeroStd: legacy.skewness([4, 4, 4, 4]),
    kurtosisZeroStd: legacy.kurtosis([4, 4, 4, 4, 4]),
    quartileSingle: legacy.quartile([9], 0.75),
    columnTypeEmpty: legacy.getColumnType([null, '']),
    columnTypeNumericStrings: legacy.getColumnType(['1', '2.5']),
    columnTypeMixed: legacy.getColumnType(['1', 'abc']),
    columnTypeBoolean: legacy.getColumnType([true, false]),
    statsEmptyColumn: legacy.calculateColumnStats([{ a: null }, { a: '' }], 'a'),
    statsSingleRow: legacy.calculateColumnStats([{ a: 5 }], 'a'),
  },
};

// `--out <path>` lets the test runner regenerate to a scratch file and compare,
// instead of overwriting the committed reference.
const outFlag = process.argv.indexOf('--out');
const target =
  outFlag === -1
    ? path.resolve(import.meta.dirname, '..', 'golden_stats.json')
    : path.resolve(process.argv[outFlag + 1]);
fs.writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`);
fs.rmSync(scratch, { recursive: true, force: true });

console.log(`Wrote ${path.relative(repoRoot, target)}`);
console.log(
  `  columns: ${Object.keys(payload.columnStats.sales).length} sales, ` +
    `${Object.keys(payload.columnStats.edge).length} edge`
);
console.log(`  functions: ${Object.keys(payload.functions).length}, edge cases: ${Object.keys(payload.edgeCases).length}`);

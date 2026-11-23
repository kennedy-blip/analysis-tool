/**
 * Browser-parity harness: loads the BUILT page (site/public/index.html) into
 * jsdom, boots assets/js/app.js, and drives the UI the way a user would.
 *
 * Run with:
 *   cd site/tests/dom && npm install && npm test
 *
 * Verified here:
 *   - every view renders and toggles, sample dataset loads from static JSON
 *   - table search / sort / pagination match DataTable.tsx
 *   - the browser statistics engine agrees with the build-time Python engine
 *   - probability calculators reproduce Probability.tsx numbers
 *   - charts emit SVG for all six types with the expected mark counts
 */

import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

const SITE = path.resolve(import.meta.dirname, '..', '..');
const PUBLIC = path.join(SITE, 'public');

if (!fs.existsSync(path.join(PUBLIC, 'index.html'))) {
  console.error('Build output not found. Run `python3 site/build.py` first.');
  process.exit(1);
}

const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');

let failures = 0;
let checks = 0;

function ok(label, condition, detail = '') {
  checks++;
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.log(`  ✗ ${label}${detail ? ` -- ${detail}` : ''}`);
  }
}

function eq(label, actual, expected) {
  ok(label, String(actual) === String(expected), `got "${actual}", expected "${expected}"`);
}

function near(label, actual, expected, tolerance = 1e-9) {
  const diff = Math.abs(Number(actual) - Number(expected));
  ok(label, diff <= tolerance, `got ${actual}, expected ${expected} (Δ ${diff})`);
}

// ---------------------------------------------------------------- DOM setup
const dom = new JSDOM(html, {
  runScripts: 'dangerously', // executes the inline DATALENS_CONFIG script
  url: 'http://localhost:4173/index.html',
  pretendToBeVisual: true,
});

const { window } = dom;
global.window = window;
global.document = window.document;
global.CustomEvent = window.CustomEvent;
global.Event = window.Event;
global.MouseEvent = window.MouseEvent;
global.Node = window.Node;
global.HTMLElement = window.HTMLElement;
global.DOMParser = window.DOMParser;
global.fetch = async (url) => {
  const target = path.join(PUBLIC, String(url).replace(/^\//, ''));
  return {
    ok: true,
    status: 200,
    json: async () => JSON.parse(fs.readFileSync(target, 'utf8')),
  };
};

const $ = (selector) => window.document.querySelector(selector);
const $$ = (selector) => Array.from(window.document.querySelectorAll(selector));
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const type = (el, value, event = 'input') => {
  el.value = value;
  el.dispatchEvent(new window.Event(event, { bubbles: true }));
};
const visible = (el) => Boolean(el) && !el.hidden;
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

const app = await import(path.join(PUBLIC, 'assets/js/app.js'));
const statistics = await import(path.join(PUBLIC, 'assets/js/statistics.js'));
const aggregate = await import(path.join(PUBLIC, 'assets/js/aggregate.js'));
const paging = await import(path.join(PUBLIC, 'assets/js/paging.js'));

const sampleData = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'data/sample_sales_data.json'), 'utf8'));
const buildStats = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'data/sample_stats.json'), 'utf8'));

console.log('\n== initial render ==');
eq('config injected', window.DATALENS_CONFIG.views.length, 5);
ok('overview visible', visible($('#view-overview')));
ok('other views hidden', ['data', 'statistics', 'probability', 'visualization']
  .every((id) => $(`#view-${id}`).hidden));
ok('empty state shown', visible($('#overview-empty')) && $('#overview-loaded').hidden);
eq('nav buttons', $$('[data-tab]').length, 5);
eq('icon sprite symbols', $$('.icon-sprite symbol').length, 33);
eq('probability defaults pre-rendered', $('#prob-binomial-percent').textContent, '24.6094%');
eq('normal pdf pre-rendered', $('#prob-pdf').textContent, '0.398942');

console.log('\n== navigation ==');
const navStatistics = $('[data-tab="statistics"]');
click(navStatistics);
ok('statistics view shown', visible($('#view-statistics')));
ok('overview hidden', $('#view-overview').hidden);
eq('header title switched', $('[data-title="statistics"]').hidden, false);
eq('nav aria-current', navStatistics.getAttribute('aria-current'), 'page');
click($('[data-tab="overview"]'));

console.log('\n== sample dataset load ==');
click($('#generate-sample'));
await tick();
await tick();

const state = app.getState();
eq('rows loaded', state.data.length, 200);
eq('dataset name', state.datasetInfo.fileName, 'sample_sales_data.csv');
ok('loaded card shown', visible($('#overview-loaded')) && $('#overview-empty').hidden);
eq('metric rows', $('#metric-rows').textContent, '200');
eq('metric columns', $('#metric-columns').textContent, '10');
eq('column chips', $$('#column-chips .chip').length, 10);
eq('sidebar status', $('#dataset-status-meta').textContent, '200 rows × 10 cols');
ok('size estimate rendered', /^~\d+\.\d{2} KB$/.test($('#metric-size').textContent),
  $('#metric-size').textContent);

console.log('\n== data table ==');
click($('[data-tab="data"]'));
await tick();
eq('header cells (# + 10 columns)', $$('#table-head-row th').length, 11);
eq('rows on page 1', $$('#table-body tr').length, 15);
eq('summary text', $('#table-summary').textContent, 'Showing 1 - 15 of 200 rows');
eq('first row number', $('#table-body tr td').textContent, '1');
eq('pager buttons', $$('#table-pager .pager-button').length, 5);
ok('prev disabled on page 1', $('#table-prev').disabled);

click($('#table-next'));
eq('page 2 summary', $('#table-summary').textContent, 'Showing 16 - 30 of 200 rows');
eq('page 2 first row number', $('#table-body tr td').textContent, '16');
eq('pager window (page 2)', $$('#table-pager .pager-button').map((b) => b.textContent).join(','), '1,2,3,4,5');

// sort descending by id (back to page 1 first, headers are rebuilt per draw)
click($$('#table-pager .pager-button')[0]);
eq('back on page 1', $('#table-summary').textContent, 'Showing 1 - 15 of 200 rows');
click($$('#table-head-row th')[1]);
eq('sort asc by id -> 1 first', $('#table-body tr td:nth-child(2)').textContent, '1');
click($$('#table-head-row th')[1]);
eq('sort desc by id -> 200 first', $('#table-body tr td:nth-child(2)').textContent, '200');
eq('aria-sort set', $$('#table-head-row th')[1].getAttribute('aria-sort'), 'descending');
eq('second row desc', $$('#table-body tr')[1].querySelectorAll('td')[1].textContent, '199');

// search filter parity with a plain JS filter
type($('#table-search'), 'Electronics');
await tick();
const expectedMatches = sampleData.filter((row) =>
  Object.values(row).some((v) => String(v).toLowerCase().includes('electronics'))
).length;
ok('search narrows result set', expectedMatches > 0 && expectedMatches < 200, `${expectedMatches} matches`);
ok('summary reflects filter', $('#table-summary').textContent.endsWith(`of ${expectedMatches} rows`),
  $('#table-summary').textContent);
type($('#table-search'), '');

console.log('\n== paging helper ==');
eq('pageWindow(1, 14)', paging.pageWindow(1, 14, 5).join(','), '1,2,3,4,5');
eq('pageWindow(7, 14)', paging.pageWindow(7, 14, 5).join(','), '5,6,7,8,9');
eq('pageWindow(13, 14)', paging.pageWindow(13, 14, 5).join(','), '10,11,12,13,14');
eq('pageWindow(3, 3)', paging.pageWindow(3, 3, 5).join(','), '1,2,3');

console.log('\n== statistics: JS engine vs Python build engine ==');
click($('[data-tab="statistics"]'));
await tick();
eq('summary rows', $('#summary-rows').textContent, '200');
eq('summary columns', $('#summary-columns').textContent, '10');
eq('summary numeric', $('#summary-numeric').textContent, String(buildStats.summary.numericColumns));
eq('summary categorical', $('#summary-categorical').textContent, String(buildStats.summary.categoricalColumns));
eq('summary missing %', $('#summary-missing-percent').textContent, `${buildStats.summary.missingPercent}%`);
eq('column cards', $$('#column-stats .column-card').length, 10);

let statMismatches = 0;
for (const column of buildStats.columns) {
  const fromPython = buildStats.columnStats.find((s) => s.name === column);
  const fromJs = statistics.calculateColumnStats(sampleData, column);
  for (const key of Object.keys(fromPython)) {
    const a = fromPython[key];
    const b = fromJs[key];
    const same = typeof a === 'number' && typeof b === 'number'
      ? Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a))
      : String(a) === String(b);
    if (!same) {
      statMismatches++;
      console.log(`    mismatch ${column}.${key}: python=${a} js=${b}`);
    }
  }
}
ok('all 10 columns agree across engines', statMismatches === 0, `${statMismatches} mismatches`);

// expand a numeric column card and check the rendered values
const salesCard = $$('#column-stats .column-card').find((c) => c.dataset.column === 'sales');
const salesHead = salesCard.querySelector('.column-head');
click(salesHead);
ok('card expands', salesCard.classList.contains('is-expanded') && visible(salesCard.querySelector('.column-body')));
const salesStats = buildStats.columnStats.find((s) => s.name === 'sales');
const rendered = Object.fromEntries(
  Array.from(salesCard.querySelectorAll('.stat-card')).map((card) => [
    card.querySelector('.stat-card-label span').textContent.trim(),
    card.querySelector('.stat-card-value').textContent,
  ])
);
eq('rendered Mean (float -> 4dp)', rendered.Mean, salesStats.mean.toFixed(4));
eq('rendered Median (raw integer)', rendered.Median, String(salesStats.median));
eq('rendered Std Dev', rendered['Std Dev'], salesStats.stdDev.toFixed(4));
eq('rendered Q1 (25%)', rendered['Q1 (25%)'], salesStats.q1.toFixed(4));
eq('rendered Sum (raw integer)', rendered.Sum, String(salesStats.sum));

const categoryCard = $$('#column-stats .column-card').find((c) => c.dataset.column === 'category');
click(categoryCard.querySelector('.column-head'));
const catRendered = Object.fromEntries(
  Array.from(categoryCard.querySelectorAll('.stat-card')).map((card) => [
    card.querySelector('.stat-card-label span').textContent.trim(),
    card.querySelector('.stat-card-value').textContent,
  ])
);
const catStats = buildStats.columnStats.find((s) => s.name === 'category');
eq('text column Most Common', catRendered['Most Common'], catStats.mostCommon);
eq('text column Least Common', catRendered['Least Common'], catStats.leastCommon);
ok('text column hides numeric stats', !('Mean' in catRendered));

console.log('\n== probability ==');
click($('[data-tab="probability"]'));
await tick();
eq('basic default percent', $('#prob-basic-percent').textContent, '0%');
type($('#prob-favorable'), '3');
type($('#prob-total'), '8');
eq('basic percent', $('#prob-basic-percent').textContent, '37.5000%');
eq('basic decimal', $('#prob-basic-decimal').textContent, '0.375000');
type($('#prob-n'), '10');
type($('#prob-r'), '3');
eq('combinations C(10,3)', $('#prob-combinations').textContent, '120');
eq('permutations P(10,3)', $('#prob-permutations').textContent, '720');
type($('#prob-n'), '200');
eq('combinations overflow guard', $('#prob-combinations').textContent, 'N/A');
type($('#prob-n'), '10');

click($('[data-prob-mode="binomial"]'));
ok('binomial panel shown', visible($('#prob-panel-binomial')) && $('#prob-panel-basic').hidden);
eq('binomial default', $('#prob-binomial-percent').textContent, '24.6094%');
eq('binomial mean', $('#prob-binomial-mean').textContent, '5.0000');
eq('binomial stddev', $('#prob-binomial-stddev').textContent, '1.5811');

click($('[data-prob-mode="poisson"]'));
eq('poisson default', $('#prob-poisson-percent').textContent, '14.0374%');
eq('poisson mean', $('#prob-poisson-mean').textContent, '5');
eq('poisson stddev', $('#prob-poisson-stddev').textContent, '2.2361');

click($('[data-prob-mode="normal"]'));
type($('#prob-normal-x'), '90');
type($('#prob-normal-mean'), '80');
type($('#prob-normal-std'), '5');
eq('z-score', $('#prob-zscore').textContent, '2.0000');
near('pdf', Number($('#prob-pdf').textContent), statistics.normalPDF(90, 80, 5), 1e-6);

click($('[data-prob-mode="correlation"]'));
ok('correlation body shown', visible($('#correlation-body')) && $('#correlation-empty').hidden);
eq('x column options', $('#prob-corr-x').options.length - 1, buildStats.numericColumns.length);
type($('#prob-corr-x'), 'sales', 'change');
type($('#prob-corr-y'), 'quantity', 'change');
ok('results visible', visible($('#correlation-results')));

const pairs = sampleData
  .map((row) => [Number(row.sales), Number(row.quantity)])
  .filter(([x, y]) => !isNaN(x) && !isNaN(y));
const expectedR = statistics.correlation(pairs.map((p) => p[0]), pairs.map((p) => p[1]));
eq('pearson r', $('#prob-correlation').textContent, expectedR.toFixed(4));
eq('r2', $('#prob-r2').textContent, `${(expectedR ** 2 * 100).toFixed(2)}%`);
eq('strength label', $('#prob-correlation-strength').textContent,
  `${Math.abs(expectedR) > 0.7 ? 'Strong' : Math.abs(expectedR) > 0.3 ? 'Moderate' : 'Weak'}${expectedR >= 0 ? ' Positive' : ' Negative'}`);

console.log('\n== visualization ==');
click($('[data-tab="visualization"]'));
await tick();
ok('placeholder before selection', visible($('#chart-placeholder')) && $('#chart-frame').hidden);
eq('x options = all columns', $('#chart-x').options.length - 1, 10);

type($('#chart-x'), 'category', 'change');
type($('#chart-y'), 'sales', 'change');
await tick();
ok('chart frame shown', visible($('#chart-frame')) && $('#chart-placeholder').hidden);

const expectedCats = aggregate.computeChartData(sampleData, {
  chartType: 'bar', xAxis: 'category', yAxis: 'sales', aggregation: 'sum',
}, window.DATALENS_CONFIG.charts);
eq('bar count = aggregated categories', $$('#chart-frame svg rect.chart-bar').length, expectedCats.length);
ok('categories <= 50', expectedCats.length <= 50);
const independent = {};
for (const row of sampleData) independent[row.category] = (independent[row.category] || 0) + Number(row.sales);
const expectedTop = Object.entries(independent).sort((a, b) => b[1] - a[1])[0];
eq('top category by summed sales', expectedCats[0].name, expectedTop[0]);
near('top category value', expectedCats[0].value, expectedTop[1], 1e-6);

click($('[data-chart-type="line"]'));
await tick();
eq('line path drawn', $$('#chart-frame svg path[stroke="#6366f1"]').length, 1);
eq('line dots', $$('#chart-frame svg circle.chart-dot').length, expectedCats.length);

click($('[data-chart-type="area"]'));
await tick();
ok('area fill drawn', $$('#chart-frame svg path[fill="#c7d2fe"]').length === 1);

click($('[data-chart-type="pie"]'));
await tick();
eq('pie slices', $$('#chart-frame svg path.chart-slice').length, expectedCats.length);
ok('legend rendered', visible($('#chart-legend')) && $$('#chart-legend .legend-item').length === expectedCats.length);
eq('y select hidden for pie? (no)', $('#chart-y-field').hidden, false);

click($('[data-chart-type="scatter"]'));
await tick();
ok('aggregation hidden for scatter', $('#chart-agg-field').hidden);
type($('#chart-x'), 'sales', 'change');
type($('#chart-y'), 'quantity', 'change');
await tick();
eq('scatter points', $$('#chart-frame svg circle.chart-dot').length,
  Math.min(sampleData.length, window.DATALENS_CONFIG.charts.maxScatterPoints));

click($('[data-chart-type="histogram"]'));
await tick();
ok('y select hidden for histogram', $('#chart-y-field').hidden);
ok('aggregation hidden for histogram', $('#chart-agg-field').hidden);
type($('#chart-x'), 'sales', 'change');
await tick();
const bins = aggregate.computeChartData(sampleData, {
  chartType: 'histogram', xAxis: 'sales', yAxis: '', aggregation: 'sum',
}, window.DATALENS_CONFIG.charts);
eq('histogram bins = min(20, ceil(sqrt(n)))', bins.length, Math.min(20, Math.ceil(Math.sqrt(200))));
eq('histogram bars', $$('#chart-frame svg rect.chart-bar').length, bins.length);
eq('all rows binned', bins.reduce((sum, b) => sum + b.count, 0), 200);
ok('bin labels formatted x.x-y.y', /^\d+\.\d-\d+\.\d$/.test(bins[0].range), bins[0].range);

console.log('\n== aggregation parity (avg/count/min/max) ==');
for (const aggregation of ['avg', 'count', 'min', 'max']) {
  const result = aggregate.computeChartData(sampleData, {
    chartType: 'bar', xAxis: 'region', yAxis: 'price', aggregation,
  }, window.DATALENS_CONFIG.charts);
  const groups = {};
  for (const row of sampleData) (groups[row.region] ||= []).push(Number(row.price));
  const expected = Object.entries(groups)
    .map(([name, values]) => ({
      name,
      value: aggregation === 'count' ? values.length
        : aggregation === 'avg' ? values.reduce((a, b) => a + b, 0) / values.length
        : aggregation === 'min' ? Math.min(...values)
        : Math.max(...values),
    }))
    .sort((a, b) => b.value - a.value);
  const same = result.length === expected.length && result.every((r, i) =>
    r.name === expected[i].name && Math.abs(r.value - expected[i].value) < 1e-9);
  ok(`${aggregation} by region`, same, JSON.stringify(result.slice(0, 2)));
}

console.log('\n== clear dataset ==');
click($('[data-tab="overview"]'));
click($('#clear-data'));
await tick();
eq('state cleared', app.getState().data.length, 0);
ok('empty state returns', visible($('#overview-empty')) && $('#overview-loaded').hidden);
ok('sidebar status resets', visible($('#dataset-status-empty')) && $('#dataset-status-loaded').hidden);
click($('[data-tab="data"]'));
ok('table empty state', visible($('#data-empty')) && $('#data-table-card').hidden);

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${checks - failures}/${checks} checks passed`);
process.exit(failures === 0 ? 0 : 1);

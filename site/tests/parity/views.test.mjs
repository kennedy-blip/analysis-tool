/**
 * Parity tests for the pure view logic extracted from the legacy components:
 * `aggregate.js` (Visualization.tsx) and `paging.js` (DataTable.tsx).
 *
 * Run with: node --test "site/tests/parity/*.test.mjs"
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { DEFAULT_LIMITS, axisLabels, computeChartData, xAxisOptions } from '../../assets/js/aggregate.js';
import { pageWindow, summaryText } from '../../assets/js/paging.js';

const PUBLIC = path.resolve(import.meta.dirname, '..', '..', 'public');
const samplePath = path.join(PUBLIC, 'data', 'sample_sales_data.json');
const sample = fs.existsSync(samplePath) ? JSON.parse(fs.readFileSync(samplePath, 'utf8')) : null;

const rows = [
  { region: 'North', category: 'A', sales: 100, price: 10.5, quantity: 2 },
  { region: 'South', category: 'A', sales: 200, price: 20.25, quantity: 5 },
  { region: 'North', category: 'B', sales: 50, price: 5, quantity: 1 },
  { region: 'East', category: 'B', sales: 25, price: 7.75, quantity: null },
  { region: 'East', category: 'C', sales: null, price: 1, quantity: 3 },
];

describe('aggregate: limits match the legacy constants', () => {
  it('defaults mirror Visualization.tsx', () => {
    assert.equal(DEFAULT_LIMITS.maxCategories, 50);
    assert.equal(DEFAULT_LIMITS.maxPieSlices, 12);
    assert.equal(DEFAULT_LIMITS.maxScatterPoints, 500);
    assert.equal(DEFAULT_LIMITS.maxHistogramBins, 20);
  });
});

describe('aggregate: categorical charts', () => {
  it('sums by category and sorts descending', () => {
    const result = computeChartData(rows, {
      chartType: 'bar', xAxis: 'region', yAxis: 'sales', aggregation: 'sum',
    });
    assert.deepEqual(result, [
      { name: 'North', value: 150 },
      { name: 'South', value: 200 },
      { name: 'East', value: 25 },
    ].sort((a, b) => b.value - a.value));
  });

  it('supports avg, count, min and max', () => {
    const by = (aggregation) =>
      computeChartData(rows, { chartType: 'bar', xAxis: 'region', yAxis: 'price', aggregation });

    assert.deepEqual(by('avg').find((d) => d.name === 'North').value, (10.5 + 5) / 2);
    assert.deepEqual(by('count').find((d) => d.name === 'East').value, 2);
    assert.deepEqual(by('min').find((d) => d.name === 'North').value, 5);
    assert.deepEqual(by('max').find((d) => d.name === 'South').value, 20.25);
  });

  it('counts rows when no value column is selected', () => {
    const result = computeChartData(rows, {
      chartType: 'bar', xAxis: 'category', yAxis: '', aggregation: 'sum',
    });
    // yAxis empty -> every row contributes 1, so sum === count
    assert.deepEqual(result.map((d) => d.value).sort((a, b) => b - a), [2, 2, 1]);
  });

  it('non-numeric values still count towards the group', () => {
    const result = computeChartData(rows, {
      chartType: 'bar', xAxis: 'region', yAxis: 'quantity', aggregation: 'count',
    });
    assert.equal(result.find((d) => d.name === 'East').value, 2);
  });

  it('returns nothing without an x axis or data', () => {
    assert.deepEqual(computeChartData(rows, { chartType: 'bar', xAxis: '', yAxis: 'sales', aggregation: 'sum' }), []);
    assert.deepEqual(computeChartData([], { chartType: 'bar', xAxis: 'region', yAxis: 'sales', aggregation: 'sum' }), []);
  });

  it('caps categories at maxCategories', () => {
    const many = Array.from({ length: 120 }, (_, i) => ({ key: `k${i}`, value: i }));
    const result = computeChartData(many, { chartType: 'bar', xAxis: 'key', yAxis: 'value', aggregation: 'sum' });
    assert.equal(result.length, 50);
    assert.equal(result[0].name, 'k119'); // sorted descending by value
  });
});

describe('aggregate: scatter', () => {
  it('pairs numeric values and names them like the legacy component', () => {
    const result = computeChartData(rows, { chartType: 'scatter', xAxis: 'sales', yAxis: 'price' });
    assert.deepEqual(result[0], { x: 100, y: 10.5, name: '100, 10.5' });
    // Legacy quirk preserved: `Number(null) === 0`, so a null cell is NOT dropped
    // by the isNaN filter -- it plots at zero and stringifies as "null".
    assert.equal(result.length, 5);
    assert.deepEqual(result[result.length - 1], { x: 0, y: 1, name: 'null, 1' });
  });

  it('needs both axes', () => {
    assert.deepEqual(computeChartData(rows, { chartType: 'scatter', xAxis: 'sales', yAxis: '' }), []);
  });

  it('caps points at maxScatterPoints', () => {
    const many = Array.from({ length: 900 }, (_, i) => ({ x: i, y: i * 2 }));
    const result = computeChartData(many, { chartType: 'scatter', xAxis: 'x', yAxis: 'y' });
    assert.equal(result.length, 500);
  });
});

describe('aggregate: histogram', () => {
  it('uses min(20, ceil(sqrt(n))) bins and inclusive last edge', () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ v: i }));
    const result = computeChartData(many, { chartType: 'histogram', xAxis: 'v' });
    assert.equal(result.length, Math.min(20, Math.ceil(Math.sqrt(200))));
    assert.equal(result.reduce((sum, bin) => sum + bin.count, 0), 200);
    assert.match(result[0].range, /^\d+\.\d-\d+\.\d$/);
  });

  it('keeps null cells as zero, like the legacy component', () => {
    const result = computeChartData(rows, { chartType: 'histogram', xAxis: 'sales' });
    // `Number(null) === 0` passes the isNaN filter, so all five rows are binned.
    assert.equal(result.reduce((sum, bin) => sum + bin.count, 0), 5);
    assert.equal(result[0].range.startsWith('0.0-'), true);
  });

  it('returns nothing for a non-numeric column', () => {
    assert.deepEqual(computeChartData(rows, { chartType: 'histogram', xAxis: 'region' }), []);
  });
});

describe('aggregate: control helpers', () => {
  it('x axis offers numeric columns only for scatter and histogram', () => {
    const columns = ['region', 'sales'];
    const numeric = ['sales'];
    assert.deepEqual(xAxisOptions('bar', columns, numeric), columns);
    assert.deepEqual(xAxisOptions('pie', columns, numeric), columns);
    assert.deepEqual(xAxisOptions('scatter', columns, numeric), numeric);
    assert.deepEqual(xAxisOptions('histogram', columns, numeric), numeric);
  });

  it('labels follow the legacy copy', () => {
    assert.deepEqual(axisLabels('bar'), { x: 'X-Axis / Category', y: 'Value Column (optional)' });
    assert.deepEqual(axisLabels('histogram'), { x: 'Column', y: 'Value Column (optional)' });
    assert.deepEqual(axisLabels('scatter'), { x: 'X-Axis / Category', y: 'Y-Axis' });
  });
});

describe('paging: DataTable.tsx window logic', () => {
  it('short ranges show every page', () => {
    assert.deepEqual(pageWindow(1, 3, 5), [1, 2, 3]);
    assert.deepEqual(pageWindow(3, 5, 5), [1, 2, 3, 4, 5]);
  });

  it('early pages anchor at 1', () => {
    assert.deepEqual(pageWindow(1, 14, 5), [1, 2, 3, 4, 5]);
    assert.deepEqual(pageWindow(3, 14, 5), [1, 2, 3, 4, 5]);
  });

  it('middle pages centre the current page', () => {
    assert.deepEqual(pageWindow(7, 14, 5), [5, 6, 7, 8, 9]);
    assert.deepEqual(pageWindow(4, 14, 5), [2, 3, 4, 5, 6]);
  });

  it('late pages anchor at the end', () => {
    assert.deepEqual(pageWindow(12, 14, 5), [10, 11, 12, 13, 14]);
    assert.deepEqual(pageWindow(14, 14, 5), [10, 11, 12, 13, 14]);
  });

  it('summary text matches the legacy format', () => {
    assert.equal(summaryText(1, 15, 200), 'Showing 1 - 15 of 200 rows');
    assert.equal(summaryText(2, 15, 200), 'Showing 16 - 30 of 200 rows');
    assert.equal(summaryText(14, 15, 200), 'Showing 196 - 200 of 200 rows');
    assert.equal(summaryText(1, 15, 0), 'Showing 0 - 0 of 0 rows');
  });
});

describe('built sample dataset', { skip: sample ? false : 'run site/build.py first' }, () => {
  it('is available as static JSON with 200 rows', () => {
    assert.equal(sample.length, 200);
    assert.deepEqual(Object.keys(sample[0]), [
      'id', 'product', 'category', 'region', 'month', 'sales', 'quantity', 'price', 'rating', 'inStock',
    ]);
  });

  it('aggregates the exported data', () => {
    const result = computeChartData(sample, {
      chartType: 'bar', xAxis: 'category', yAxis: 'sales', aggregation: 'sum',
    });
    const expected = {};
    for (const row of sample) expected[row.category] = (expected[row.category] || 0) + row.sales;
    assert.equal(result.length, Object.keys(expected).length);
    for (const { name, value } of result) assert.equal(value, expected[name]);
  });

  it('histograms the exported sales column', () => {
    const bins = computeChartData(sample, { chartType: 'histogram', xAxis: 'sales' });
    assert.equal(bins.length, Math.min(20, Math.ceil(Math.sqrt(sample.length))));
    assert.equal(bins.reduce((sum, bin) => sum + bin.count, 0), sample.length);
  });
});

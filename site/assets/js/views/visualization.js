/**
 * Visualization view — port of `src/components/Visualization.tsx`.
 *
 * Data preparation lives in `aggregate.js` (pure, unit-tested); this module owns
 * the DOM wiring and delegates drawing to `charts.js`, which emits inline SVG
 * instead of Recharts components.
 */

import { ChartRenderer } from '../charts.js';
import { axisLabels, computeChartData, xAxisOptions } from '../aggregate.js';
import { numericColumnsFor } from '../statistics.js';

const config = window.DATALENS_CONFIG;
const limits = config.charts;

const dom = {
  empty: document.getElementById('visualization-empty'),
  content: document.getElementById('visualization-content'),
  xField: document.getElementById('chart-x'),
  yField: document.getElementById('chart-y'),
  yFieldWrap: document.getElementById('chart-y-field'),
  aggField: document.getElementById('chart-agg'),
  aggFieldWrap: document.getElementById('chart-agg-field'),
  xLabel: document.getElementById('chart-x-label'),
  yLabel: document.getElementById('chart-y-label'),
  placeholder: document.getElementById('chart-placeholder'),
  frame: document.getElementById('chart-frame'),
  tooltip: document.getElementById('chart-tooltip'),
  legend: document.getElementById('chart-legend'),
};

const view = {
  chartType: config.chartTypes[0],
  xAxis: '',
  yAxis: '',
  aggregation: config.aggregations[0],
  datasetKey: null,
};

let currentState = { data: [], datasetInfo: null };
let renderer = null;

function fillSelect(select, columns, current) {
  select.innerHTML = '<option value="">Select column...</option>';
  columns.forEach((column) => {
    const option = document.createElement('option');
    option.value = column;
    option.textContent = column;
    select.appendChild(option);
  });
  select.value = columns.includes(current) ? current : '';
}

function numericColumns() {
  const columns = currentState.datasetInfo?.columns ?? [];
  return currentState.data.length ? numericColumnsFor(currentState.data, columns) : [];
}

function updateControls() {
  const columns = currentState.datasetInfo?.columns ?? [];
  const numeric = numericColumns();

  fillSelect(dom.xField, xAxisOptions(view.chartType, columns, numeric), view.xAxis);
  view.xAxis = dom.xField.value;

  dom.yFieldWrap.hidden = view.chartType === 'histogram';
  dom.aggFieldWrap.hidden = view.chartType === 'scatter' || view.chartType === 'histogram';

  fillSelect(dom.yField, numeric, view.yAxis);
  view.yAxis = dom.yField.value;

  const labels = axisLabels(view.chartType);
  dom.xLabel.textContent = labels.x;
  dom.yLabel.textContent = labels.y;
}

function draw() {
  const chartData = computeChartData(
    currentState.data,
    {
      chartType: view.chartType,
      xAxis: view.xAxis,
      yAxis: view.yAxis,
      aggregation: view.aggregation,
    },
    limits
  );

  if (chartData.length === 0) {
    dom.placeholder.hidden = false;
    dom.frame.hidden = true;
    renderer?.clear();
    return;
  }

  dom.placeholder.hidden = true;
  dom.frame.hidden = false;
  renderer.render(view.chartType, chartData, { xLabel: view.xAxis, yLabel: view.yAxis });
}

export function renderVisualization(state) {
  currentState = state;

  const loaded = Boolean(state.datasetInfo) && state.data.length > 0;
  dom.empty.hidden = loaded;
  dom.content.hidden = !loaded;
  if (!loaded) return;

  const key = `${state.datasetInfo.fileName}:${state.datasetInfo.rowCount}:${state.datasetInfo.columnCount}`;
  if (key !== view.datasetKey) {
    view.datasetKey = key;
    view.xAxis = '';
    view.yAxis = '';
  }

  updateControls();
  draw();
}

export function initVisualization() {
  renderer = new ChartRenderer({
    frame: dom.frame,
    tooltip: dom.tooltip,
    legend: dom.legend,
    palette: limits.palette,
  });

  const tabs = Array.from(document.querySelectorAll('[data-chart-type]'));
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      view.chartType = tab.dataset.chartType;
      tabs.forEach((other) => {
        const active = other === tab;
        other.classList.toggle('is-active', active);
        other.setAttribute('aria-selected', String(active));
      });
      updateControls();
      draw();
    });
  });

  dom.xField.addEventListener('change', () => {
    view.xAxis = dom.xField.value;
    draw();
  });

  dom.yField.addEventListener('change', () => {
    view.yAxis = dom.yField.value;
    draw();
  });

  dom.aggField.addEventListener('change', () => {
    view.aggregation = dom.aggField.value;
    draw();
  });
}

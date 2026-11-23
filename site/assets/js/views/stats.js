/**
 * Statistics view — port of `src/components/Statistics.tsx`.
 *
 * Column statistics are computed in the browser with `statistics.js`, except for
 * the bundled sample dataset: `site/build.py` pre-computes those with the Python
 * port (`site/stats.py`) and embeds them in the page, which is used as a fast
 * path (and is what makes the generated numbers testable at build time).
 */

import { calculateColumnStats, datasetSummary } from '../statistics.js';

const dom = {
  empty: document.getElementById('statistics-empty'),
  content: document.getElementById('statistics-content'),
  rows: document.getElementById('summary-rows'),
  columns: document.getElementById('summary-columns'),
  numeric: document.getElementById('summary-numeric'),
  categorical: document.getElementById('summary-categorical'),
  missing: document.getElementById('summary-missing'),
  missingPercent: document.getElementById('summary-missing-percent'),
  columnStats: document.getElementById('column-stats'),
};

const icon = (name, extra = '') =>
  `<svg class="icon ${extra}" aria-hidden="true"><use href="#icon-${name}"></use></svg>`;

/**
 * `StatCard` in Statistics.tsx:
 *   typeof value === 'number' ? (Number.isInteger(value) ? value : value.toFixed(4)) : value
 * React prints the raw number, so integers keep no thousands separators.
 */
export function formatStatValue(value) {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : value.toFixed(4);
  }
  return String(value);
}

function statCard({ label, value, iconName, color }) {
  if (value === undefined || value === null) return '';
  const display = formatStatValue(value);
  return `<div class="stat-card">
      <div class="stat-card-label">
        ${iconName ? icon(iconName, color || 'text-gray') : ''}
        <span>${label}</span>
      </div>
      <p class="stat-card-value" title="${escapeAttr(display)}">${escapeHtml(display)}</p>
    </div>`;
}

function numericCards(stats) {
  return [
    statCard({ label: 'Mean', value: stats.mean, iconName: 'trending-up', color: 'text-blue' }),
    statCard({ label: 'Median', value: stats.median }),
    statCard({ label: 'Mode', value: stats.mode }),
    statCard({ label: 'Min', value: stats.min, iconName: 'trending-down', color: 'text-red' }),
    statCard({ label: 'Max', value: stats.max, iconName: 'trending-up', color: 'text-green' }),
    statCard({ label: 'Range', value: stats.range }),
    statCard({ label: 'Sum', value: stats.sum }),
    statCard({ label: 'Std Dev', value: stats.stdDev }),
    statCard({ label: 'Variance', value: stats.variance }),
    statCard({ label: 'Q1 (25%)', value: stats.q1 }),
    statCard({ label: 'Q3 (75%)', value: stats.q3 }),
    statCard({ label: 'IQR', value: stats.iqr }),
    statCard({ label: 'Skewness', value: stats.skewness }),
    statCard({ label: 'Kurtosis', value: stats.kurtosis }),
  ].join('');
}

function categoricalCards(stats) {
  return [
    statCard({ label: 'Most Common', value: stats.mostCommon }),
    statCard({ label: 'Least Common', value: stats.leastCommon }),
  ].join('');
}

function columnCard(stats) {
  const numeric = stats.type === 'numeric';
  const missingWarning =
    stats.missing > 0
      ? `<span class="column-warning">${icon('alert-triangle', 'icon-sm')} ${stats.missing} missing</span>`
      : '';

  const details = [
    statCard({ label: 'Count', value: stats.count }),
    statCard({ label: 'Unique', value: stats.unique }),
    statCard({
      label: 'Missing',
      value: stats.missing,
      color: stats.missing > 0 ? 'text-amber' : undefined,
    }),
    numeric ? numericCards(stats) : '',
    stats.type === 'string' || stats.type === 'mixed' ? categoricalCards(stats) : '',
  ].join('');

  return `<div class="column-card" data-column="${escapeAttr(stats.name)}">
      <button type="button" class="column-head" aria-expanded="false">
        <span class="column-identity">
          <span class="column-badge ${numeric ? 'badge-blue' : 'badge-green'}">
            ${icon(numeric ? 'hash' : 'type')}
          </span>
          <span class="column-heading">
            <span class="column-name">${escapeHtml(stats.name)}</span>
            <span class="column-meta">${stats.type} &bull; ${stats.count} values</span>
          </span>
        </span>
        <span class="column-actions">
          ${missingWarning}
          ${icon('bar-chart-3', 'column-chevron')}
        </span>
      </button>
      <div class="column-body" hidden>
        <div class="stat-grid">${details}</div>
      </div>
    </div>`;
}

/** Uses build-time stats when the loaded dataset is the bundled sample. */
export function resolveStats(state) {
  const info = state.datasetInfo;
  const precomputed = state.precomputed;

  if (
    precomputed &&
    info.fileName === precomputed.fileName &&
    info.rowCount === precomputed.rowCount &&
    info.columnCount === precomputed.columnCount &&
    JSON.stringify(info.columns) === JSON.stringify(precomputed.columns)
  ) {
    return { columnStats: precomputed.columnStats, summary: precomputed.summary, source: 'build' };
  }

  const columnStats = info.columns.map((column) => calculateColumnStats(state.data, column));
  return {
    columnStats,
    summary: datasetSummary(state.data, info.columns),
    source: 'runtime',
  };
}

export function renderStatistics(state) {
  const loaded = Boolean(state.datasetInfo) && state.data.length > 0;
  dom.empty.hidden = loaded;
  dom.content.hidden = !loaded;
  if (!loaded) return;

  const { columnStats, summary } = resolveStats(state);

  dom.rows.textContent = summary.totalRows.toLocaleString();
  dom.columns.textContent = String(summary.totalColumns);
  dom.numeric.textContent = String(summary.numericColumns);
  dom.categorical.textContent = String(summary.categoricalColumns);
  dom.missing.textContent = summary.missingValues.toLocaleString();
  dom.missingPercent.textContent = `${summary.missingPercent}%`;

  dom.columnStats.innerHTML = columnStats.map(columnCard).join('');
  dom.columnStats.querySelectorAll('.column-head').forEach((button) => {
    button.addEventListener('click', () => {
      const expanded = button.getAttribute('aria-expanded') === 'true';
      button.setAttribute('aria-expanded', String(!expanded));
      button.closest('.column-card').classList.toggle('is-expanded', !expanded);
      const body = button.parentElement.querySelector('.column-body');
      body.hidden = expanded;
    });
  });
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escapeAttr(text) {
  return escapeHtml(text).replaceAll('"', '&quot;');
}
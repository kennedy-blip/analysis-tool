/**
 * Chart renderer — replaces the Recharts components used by
 * `src/components/Visualization.tsx` with dependency-free inline SVG.
 *
 * Supported types match the original: bar, line, area, pie, scatter, histogram,
 * with the same palette, dashed grid, angled category labels, hover tooltips and
 * pie legend.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

const MARGIN = { top: 20, right: 30, bottom: 90, left: 72 };

function el(name, attrs = {}, parent = null) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== null && value !== undefined) node.setAttribute(key, String(value));
  }
  if (parent) parent.appendChild(node);
  return node;
}

function formatTick(value) {
  if (!isFinite(value)) return '';
  if (Number.isInteger(value)) return value.toLocaleString();
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatValue(value) {
  if (!isFinite(value)) return '—';
  if (Number.isInteger(value)) return value.toLocaleString();
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function truncate(label, max = 22) {
  const text = String(label ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** "Nice" axis ticks, the way D3 (and therefore Recharts) picks them. */
export function niceTicks(min, max, count = 5) {
  if (min === max) {
    if (min === 0) return { min: 0, max: 1, step: 0.2, ticks: [0, 0.25, 0.5, 0.75, 1] };
    const pad = Math.abs(min) * 0.1 || 1;
    min -= pad;
    max += pad;
  }

  const span = max - min;
  const rawStep = span / count;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalized = rawStep / magnitude;
  const stepFactor = normalized >= 5 ? 10 : normalized >= 2 ? 5 : normalized >= 1 ? 2 : 1;
  const step = stepFactor * magnitude;

  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks = [];
  for (let value = niceMin; value <= niceMax + step / 2; value += step) {
    ticks.push(Math.abs(value) < step / 1e6 ? 0 : value);
  }
  return { min: niceMin, max: niceMax, step, ticks };
}

/** Monotone cubic interpolation (Recharts `type="monotone"`). */
function monotonePath(points) {
  const n = points.length;
  if (n === 0) return '';
  if (n === 1) return `M ${points[0].x} ${points[0].y}`;
  if (n === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;

  const dx = [];
  const dy = [];
  const slopes = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(points[i + 1].x - points[i].x);
    dy.push(points[i + 1].y - points[i].y);
    slopes.push(dy[i] / (dx[i] || 1e-9));
  }

  const tangents = [slopes[0]];
  for (let i = 1; i < n - 1; i++) {
    if (slopes[i - 1] * slopes[i] <= 0) {
      tangents.push(0);
    } else {
      const common = dx[i - 1] + dx[i];
      tangents.push((3 * common) / ((common + dx[i]) / slopes[i - 1] + (common + dx[i - 1]) / slopes[i]));
    }
  }
  tangents.push(slopes[n - 2]);

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const c1x = points[i].x + dx[i] / 3;
    const c1y = points[i].y + (tangents[i] * dx[i]) / 3;
    const c2x = points[i + 1].x - dx[i] / 3;
    const c2y = points[i + 1].y - (tangents[i + 1] * dx[i]) / 3;
    path += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${points[i + 1].x} ${points[i + 1].y}`;
  }
  return path;
}

export class ChartRenderer {
  /**
   * @param {{frame: HTMLElement, tooltip: HTMLElement, legend: HTMLElement, palette: string[]}} options
   */
  constructor({ frame, tooltip, legend, palette }) {
    this.frame = frame;
    this.tooltip = tooltip;
    this.legend = legend;
    this.palette = palette;
    this.resizeObserver = null;
    this.current = null;
  }

  clear() {
    this.current = null;
    this.frame.querySelectorAll('svg').forEach((node) => node.remove());
    this.legend.hidden = true;
    this.legend.innerHTML = '';
    this.hideTooltip();
  }

  hideTooltip() {
    this.tooltip.hidden = true;
  }

  showTooltip(html, clientX, clientY) {
    this.tooltip.innerHTML = html;
    this.tooltip.hidden = false;
    const bounds = this.frame.getBoundingClientRect();
    const tipBounds = this.tooltip.getBoundingClientRect();
    let left = clientX - bounds.left + 14;
    let top = clientY - bounds.top - tipBounds.height - 10;
    if (left + tipBounds.width > bounds.width) left = Math.max(8, left - tipBounds.width - 28);
    if (top < 0) top = clientY - bounds.top + 14;
    this.tooltip.style.left = `${left}px`;
    this.tooltip.style.top = `${top}px`;
  }

  bindTooltip(node, html) {
    node.addEventListener('mouseenter', (event) => this.showTooltip(html, event.clientX, event.clientY));
    node.addEventListener('mousemove', (event) => this.showTooltip(html, event.clientX, event.clientY));
    node.addEventListener('mouseleave', () => this.hideTooltip());
  }

  /**
   * @param {'bar'|'line'|'area'|'pie'|'scatter'|'histogram'} type
   * @param {Array<object>} data
   * @param {{xLabel?: string, yLabel?: string}} meta
   */
  render(type, data, meta = {}) {
    this.clear();
    if (!data || data.length === 0) return false;

    this.current = { type, data, meta };

    const width = Math.max(320, this.frame.clientWidth);
    const height = Math.max(280, this.frame.clientHeight || 384);
    const svg = el('svg', {
      width,
      height,
      viewBox: `0 0 ${width} ${height}`,
      class: 'chart-svg',
      role: 'img',
      'aria-label': `${type} chart`,
    });
    this.frame.appendChild(svg);

    switch (type) {
      case 'pie':
        this.drawPie(svg, data, width, height);
        break;
      case 'scatter':
        this.drawScatter(svg, data, width, height, meta);
        break;
      case 'histogram':
        this.drawHistogram(svg, data, width, height);
        break;
      case 'line':
      case 'area':
        this.drawSeries(svg, data, width, height, type);
        break;
      default:
        this.drawBars(svg, data, width, height);
    }

    this.ensureResizeObserver();
    return true;
  }

  ensureResizeObserver() {
    if (this.resizeObserver || typeof ResizeObserver === 'undefined') return;
    this.resizeObserver = new ResizeObserver(() => {
      if (!this.current) return;
      const { type, data, meta } = this.current;
      this.resizeObserver = null;
      this.render(type, data, meta);
    });
    this.resizeObserver.observe(this.frame);
  }

  drawAxes(svg, width, height, { yScale, yTicks, categories, xBand, bottom = MARGIN.bottom }) {
    const plotLeft = MARGIN.left;
    const plotRight = width - MARGIN.right;
    const plotTop = MARGIN.top;
    const plotBottom = height - bottom;

    const grid = el('g', { class: 'chart-grid' }, svg);
    yTicks.forEach((tick) => {
      const y = yScale(tick);
      el('line', { x1: plotLeft, x2: plotRight, y1: y, y2: y, stroke: '#f0f0f0', 'stroke-dasharray': '3 3' }, grid);
      const label = el('text', {
        x: plotLeft - 10,
        y: y + 4,
        'text-anchor': 'end',
        class: 'chart-tick',
      }, svg);
      label.textContent = formatTick(tick);
    });

    el('line', { x1: plotLeft, x2: plotLeft, y1: plotTop, y2: plotBottom, stroke: '#e5e7eb' }, svg);
    el('line', { x1: plotLeft, x2: plotRight, y1: plotBottom, y2: plotBottom, stroke: '#e5e7eb' }, svg);

    if (categories) {
      categories.forEach((category, index) => {
        const x = xBand(index);
        const label = el('text', {
          x,
          y: plotBottom + 16,
          class: 'chart-tick',
          'text-anchor': 'end',
          transform: `rotate(-45 ${x} ${plotBottom + 16})`,
        }, svg);
        label.textContent = truncate(category);
      });
    }

    return { plotLeft, plotRight, plotTop, plotBottom };
  }

  drawBars(svg, data, width, height) {
    const values = data.map((d) => Number(d.value) || 0);
    const { min, ticks } = niceTicks(Math.min(0, ...values), Math.max(0, ...values));
    const max = Math.max(...ticks);
    const bottom = MARGIN.bottom;
    const plotHeight = height - MARGIN.top - bottom;
    const yScale = (value) => MARGIN.top + plotHeight - ((value - min) / (max - min || 1)) * plotHeight;
    const bandWidth = (width - MARGIN.left - MARGIN.right) / data.length;
    const xBand = (index) => MARGIN.left + bandWidth * index + bandWidth / 2;

    this.drawAxes(svg, width, height, {
      yScale,
      yTicks: ticks,
      categories: data.map((d) => d.name),
      xBand,
      bottom,
    });

    const barWidth = Math.max(2, Math.min(bandWidth * 0.7, 64));
    data.forEach((d, index) => {
      const value = Number(d.value) || 0;
      const y = yScale(value);
      const baseline = yScale(Math.max(min, 0));
      const rectHeight = Math.max(1, baseline - y);
      const bar = el('rect', {
        x: xBand(index) - barWidth / 2,
        y,
        width: barWidth,
        height: rectHeight,
        rx: Math.min(4, barWidth / 2),
        fill: this.palette[index % this.palette.length],
        class: 'chart-bar',
      }, svg);
      this.bindTooltip(bar, tooltipHtml(d.name, value));
    });
  }

  drawSeries(svg, data, width, height, type) {
    const values = data.map((d) => Number(d.value) || 0);
    const { min, ticks } = niceTicks(Math.min(0, ...values), Math.max(...values));
    const max = Math.max(...ticks);
    const bottom = MARGIN.bottom;
    const plotHeight = height - MARGIN.top - bottom;
    const plotWidth = width - MARGIN.left - MARGIN.right;
    const yScale = (value) => MARGIN.top + plotHeight - ((value - min) / (max - min || 1)) * plotHeight;
    const xBand = (index) =>
      MARGIN.left + (data.length === 1 ? plotWidth / 2 : (plotWidth * index) / (data.length - 1));

    this.drawAxes(svg, width, height, {
      yScale,
      yTicks: ticks,
      categories: data.map((d) => d.name),
      xBand,
      bottom,
    });

    const points = data.map((d, index) => ({ x: xBand(index), y: yScale(Number(d.value) || 0), datum: d }));
    const path = monotonePath(points);

    if (type === 'area') {
      const baseline = yScale(Math.max(min, 0));
      el('path', {
        d: `${path} L ${points[points.length - 1].x} ${baseline} L ${points[0].x} ${baseline} Z`,
        fill: '#c7d2fe',
        'fill-opacity': 0.6,
        stroke: 'none',
      }, svg);
    }

    el('path', {
      d: path,
      fill: 'none',
      stroke: '#6366f1',
      'stroke-width': 2,
      'stroke-linejoin': 'round',
      'stroke-linecap': 'round',
    }, svg);

    if (type === 'line') {
      points.forEach((point) => {
        const dot = el('circle', {
          cx: point.x,
          cy: point.y,
          r: 4,
          fill: '#6366f1',
          stroke: '#ffffff',
          'stroke-width': 2,
          class: 'chart-dot',
        }, svg);
        this.bindTooltip(dot, tooltipHtml(point.datum.name, Number(point.datum.value) || 0));
      });
    } else {
      points.forEach((point) => {
        const hit = el('circle', { cx: point.x, cy: point.y, r: 10, fill: 'transparent', class: 'chart-hit' }, svg);
        this.bindTooltip(hit, tooltipHtml(point.datum.name, Number(point.datum.value) || 0));
      });
    }
  }

  drawHistogram(svg, data, width, height) {
    const counts = data.map((d) => Number(d.count) || 0);
    const { min, ticks } = niceTicks(0, Math.max(...counts));
    const max = Math.max(...ticks);
    const bottom = MARGIN.bottom;
    const plotHeight = height - MARGIN.top - bottom;
    const yScale = (value) => MARGIN.top + plotHeight - ((value - min) / (max - min || 1)) * plotHeight;
    const bandWidth = (width - MARGIN.left - MARGIN.right) / data.length;
    const xBand = (index) => MARGIN.left + bandWidth * index + bandWidth / 2;

    this.drawAxes(svg, width, height, {
      yScale,
      yTicks: ticks,
      categories: data.map((d) => d.range),
      xBand,
      bottom,
    });

    data.forEach((d, index) => {
      const value = Number(d.count) || 0;
      const y = yScale(value);
      const barHeight = Math.max(1, yScale(0) - y);
      const bar = el('rect', {
        x: xBand(index) - bandWidth * 0.45,
        y,
        width: Math.max(2, bandWidth * 0.9),
        height: barHeight,
        rx: Math.min(4, bandWidth / 2),
        fill: '#8b5cf6',
        class: 'chart-bar',
      }, svg);
      this.bindTooltip(bar, tooltipHtml(`${d.range}`, value, 'Count'));
    });
  }

  drawScatter(svg, data, width, height, meta) {
    const xs = data.map((d) => Number(d.x));
    const ys = data.map((d) => Number(d.y));
    const xTicks = niceTicks(Math.min(...xs), Math.max(...xs));
    const yTicks = niceTicks(Math.min(...ys), Math.max(...ys));
    const bottom = 60;
    const plotHeight = height - MARGIN.top - bottom;
    const plotWidth = width - MARGIN.left - MARGIN.right;
    const xScale = (value) =>
      MARGIN.left + ((value - xTicks.min) / (xTicks.max - xTicks.min || 1)) * plotWidth;
    const yScale = (value) =>
      MARGIN.top + plotHeight - ((value - yTicks.min) / (yTicks.max - yTicks.min || 1)) * plotHeight;

    const grid = el('g', { class: 'chart-grid' }, svg);
    yTicks.ticks.forEach((tick) => {
      const y = yScale(tick);
      el('line', { x1: MARGIN.left, x2: width - MARGIN.right, y1: y, y2: y, stroke: '#f0f0f0', 'stroke-dasharray': '3 3' }, grid);
      const label = el('text', { x: MARGIN.left - 10, y: y + 4, 'text-anchor': 'end', class: 'chart-tick' }, svg);
      label.textContent = formatTick(tick);
    });
    xTicks.ticks.forEach((tick) => {
      const x = xScale(tick);
      el('line', { x1: x, x2: x, y1: MARGIN.top, y2: MARGIN.top + plotHeight, stroke: '#f0f0f0', 'stroke-dasharray': '3 3' }, grid);
      const label = el('text', { x, y: MARGIN.top + plotHeight + 20, 'text-anchor': 'middle', class: 'chart-tick' }, svg);
      label.textContent = formatTick(tick);
    });

    el('line', { x1: MARGIN.left, x2: MARGIN.left, y1: MARGIN.top, y2: MARGIN.top + plotHeight, stroke: '#e5e7eb' }, svg);
    el('line', { x1: MARGIN.left, x2: width - MARGIN.right, y1: MARGIN.top + plotHeight, y2: MARGIN.top + plotHeight, stroke: '#e5e7eb' }, svg);

    data.forEach((d) => {
      const dot = el('circle', {
        cx: xScale(Number(d.x)),
        cy: yScale(Number(d.y)),
        r: 5,
        fill: '#6366f1',
        'fill-opacity': 0.75,
        class: 'chart-dot',
      }, svg);
      this.bindTooltip(
        dot,
        `<p class="chart-tooltip-label">${escapeHtml(d.name ?? '')}</p>
         <p class="chart-tooltip-row"><span>${escapeHtml(meta.xLabel || 'x')}</span><b>${formatValue(Number(d.x))}</b></p>
         <p class="chart-tooltip-row"><span>${escapeHtml(meta.yLabel || 'y')}</span><b>${formatValue(Number(d.y))}</b></p>`
      );
    });
  }

  drawPie(svg, data, width, height) {
    const slices = data.slice(0, this.palette.length ? data.length : data.length);
    const total = slices.reduce((sum, d) => sum + (Number(d.value) || 0), 0);
    if (total === 0) return;

    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(120, Math.max(60, Math.min(width, height) / 2 - 60));
    let angle = -Math.PI / 2;

    slices.forEach((d, index) => {
      const value = Number(d.value) || 0;
      const sweep = (value / total) * Math.PI * 2;
      const end = angle + sweep;
      const largeArc = sweep > Math.PI ? 1 : 0;
      const x1 = cx + radius * Math.cos(angle);
      const y1 = cy + radius * Math.sin(angle);
      const x2 = cx + radius * Math.cos(end);
      const y2 = cy + radius * Math.sin(end);
      const color = this.palette[index % this.palette.length];

      const path = el('path', {
        d: `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`,
        fill: color,
        stroke: '#ffffff',
        'stroke-width': 1,
        class: 'chart-slice',
      }, svg);
      this.bindTooltip(path, tooltipHtml(d.name, value));

      const percent = value / total;
      const mid = angle + sweep / 2;
      const labelRadius = radius * 0.65;
      if (percent >= 0.03) {
        const label = el('text', {
          x: cx + labelRadius * Math.cos(mid),
          y: cy + labelRadius * Math.sin(mid),
          'text-anchor': 'middle',
          class: 'chart-pie-label',
        }, svg);
        label.textContent = `${truncate(d.name, 14)} (${(percent * 100).toFixed(0)}%)`;
      }

      angle = end;
    });

    this.legend.hidden = false;
    this.legend.innerHTML = slices
      .map(
        (d, index) =>
          `<span class="legend-item"><i style="background:${this.palette[index % this.palette.length]}"></i>${escapeHtml(
            String(d.name)
          )}</span>`
      )
      .join('');
  }
}

function tooltipHtml(label, value, valueLabel = 'value') {
  return `<p class="chart-tooltip-label">${escapeHtml(String(label ?? ''))}</p>
    <p class="chart-tooltip-row"><span>${escapeHtml(valueLabel)}</span><b>${formatValue(value)}</b></p>`;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

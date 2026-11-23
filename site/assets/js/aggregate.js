/**
 * Chart data preparation — pure logic extracted from
 * `src/components/Visualization.tsx` so it can be unit-tested without a DOM.
 *
 * `limits` comes from `site.json` (`charts` block) and matches the constants
 * hard-coded in the React component: 50 categories, 12 pie slices, 500 scatter
 * points, 20 histogram bins.
 */

export const DEFAULT_LIMITS = {
  maxCategories: 50,
  maxPieSlices: 12,
  maxScatterPoints: 500,
  maxHistogramBins: 20,
};

/**
 * @param {Array<object>} data rows of the loaded dataset
 * @param {{chartType: string, xAxis: string, yAxis: string, aggregation: string}} selection
 * @param {typeof DEFAULT_LIMITS} [limits]
 */
export function computeChartData(data, selection, limits = DEFAULT_LIMITS) {
  const { chartType, xAxis, yAxis, aggregation } = selection;
  if (!xAxis || data.length === 0) return [];

  if (chartType === 'scatter') {
    if (!yAxis) return [];
    return data
      .map((row) => ({
        x: Number(row[xAxis]),
        y: Number(row[yAxis]),
        name: `${row[xAxis]}, ${row[yAxis]}`,
      }))
      .filter((d) => !isNaN(d.x) && !isNaN(d.y))
      .slice(0, limits.maxScatterPoints);
  }

  if (chartType === 'histogram') {
    const values = data.map((row) => Number(row[xAxis])).filter((v) => !isNaN(v));
    if (values.length === 0) return [];

    const min = Math.min(...values);
    const max = Math.max(...values);
    const binCount = Math.min(limits.maxHistogramBins, Math.ceil(Math.sqrt(values.length)));
    const binWidth = (max - min) / binCount;

    const bins = [];
    for (let i = 0; i < binCount; i++) {
      const binMin = min + i * binWidth;
      const binMax = min + (i + 1) * binWidth;
      const count = values.filter(
        (v) => v >= binMin && (i === binCount - 1 ? v <= binMax : v < binMax)
      ).length;
      bins.push({ range: `${binMin.toFixed(1)}-${binMax.toFixed(1)}`, count });
    }
    return bins;
  }

  const aggregated = new Map();

  data.forEach((row) => {
    const key = String(row[xAxis] ?? 'Unknown');
    const value = yAxis ? Number(row[yAxis]) : 1;

    if (!aggregated.has(key)) {
      aggregated.set(key, { sum: 0, count: 0, values: [] });
    }

    const bucket = aggregated.get(key);
    if (!isNaN(value)) {
      bucket.sum += value;
      bucket.count++;
      bucket.values.push(value);
    } else {
      bucket.count++;
    }
  });

  return Array.from(aggregated.entries())
    .map(([name, bucket]) => {
      let value;
      switch (aggregation) {
        case 'sum':
          value = bucket.sum;
          break;
        case 'avg':
          value = bucket.values.length > 0 ? bucket.sum / bucket.values.length : 0;
          break;
        case 'count':
          value = bucket.count;
          break;
        case 'min':
          value = bucket.values.length > 0 ? Math.min(...bucket.values) : 0;
          break;
        case 'max':
          value = bucket.values.length > 0 ? Math.max(...bucket.values) : 0;
          break;
        default:
          value = bucket.sum;
      }
      return { name, value };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, limits.maxCategories);
}

/** Columns offered on the X axis for a given chart type (Visualization.tsx). */
export function xAxisOptions(chartType, columns, numericColumns) {
  return chartType === 'histogram' || chartType === 'scatter' ? numericColumns : columns;
}

/** Labels used above the configuration selects (Visualization.tsx). */
export function axisLabels(chartType) {
  return {
    x: chartType === 'histogram' ? 'Column' : 'X-Axis / Category',
    y: chartType === 'scatter' ? 'Y-Axis' : 'Value Column (optional)',
  };
}

/**
 * Statistics engine — direct ES-module port of `src/utils/statistics.ts`.
 *
 * Every formula, guard and tie-breaking rule is preserved so the static site
 * produces exactly the numbers the React/Vite build produced.
 */

/** @typedef {Record<string, string|number|boolean|null>} DataRow */

const MISSING = (v) => v === null || v === undefined || v === '';

export function getColumnType(values) {
  const nonNullValues = values.filter((v) => !MISSING(v));

  if (nonNullValues.length === 0) return 'string';

  const types = new Set(
    nonNullValues.map((v) => {
      if (typeof v === 'boolean') return 'boolean';
      if (typeof v === 'number' || (!isNaN(Number(v)) && v !== '')) return 'numeric';
      return 'string';
    })
  );

  if (types.size === 1) {
    const value = types.values().next().value;
    if (value === 'numeric' || value === 'string' || value === 'boolean') return value;
  }
  return 'mixed';
}

export function mean(values) {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function mode(values) {
  if (values.length === 0) return undefined;
  const frequency = {};
  values.forEach((v) => {
    const key = String(v);
    frequency[key] = (frequency[key] || 0) + 1;
  });

  let maxFreq = 0;
  let modeValue;

  Object.entries(frequency).forEach(([key, freq]) => {
    if (freq > maxFreq) {
      maxFreq = freq;
      modeValue = key;
    }
  });

  const numValue = Number(modeValue);
  return isNaN(numValue) ? modeValue : numValue;
}

export function variance(values) {
  if (values.length === 0) return 0;
  const avg = mean(values);
  return values.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / values.length;
}

export function stdDev(values) {
  return Math.sqrt(variance(values));
}

export function quartile(values, q) {
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;

  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

export function skewness(values) {
  if (values.length < 3) return 0;
  const n = values.length;
  const avg = mean(values);
  const std = stdDev(values);
  if (std === 0) return 0;

  const sum = values.reduce((acc, val) => acc + Math.pow((val - avg) / std, 3), 0);
  return (n / ((n - 1) * (n - 2))) * sum;
}

export function kurtosis(values) {
  if (values.length < 4) return 0;
  const n = values.length;
  const avg = mean(values);
  const std = stdDev(values);
  if (std === 0) return 0;

  const sum = values.reduce((acc, val) => acc + Math.pow((val - avg) / std, 4), 0);
  return ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * sum -
    (3 * Math.pow(n - 1, 2)) / ((n - 2) * (n - 3));
}

/**
 * @param {DataRow[]} data
 * @param {string} columnName
 */
export function calculateColumnStats(data, columnName) {
  const values = data.map((row) => row[columnName]);
  const type = getColumnType(values);
  const nonNullValues = values.filter((v) => !MISSING(v));
  const uniqueValues = new Set(nonNullValues.map(String));

  const stats = {
    name: columnName,
    type,
    count: data.length,
    missing: values.length - nonNullValues.length,
    unique: uniqueValues.size,
  };

  if (type === 'numeric' || type === 'mixed') {
    const numericValues = nonNullValues
      .map((v) => (typeof v === 'number' ? v : Number(v)))
      .filter((v) => !isNaN(v));

    if (numericValues.length > 0) {
      stats.mean = mean(numericValues);
      stats.median = median(numericValues);
      stats.mode = mode(numericValues);
      stats.min = Math.min(...numericValues);
      stats.max = Math.max(...numericValues);
      stats.range = stats.max - stats.min;
      stats.sum = numericValues.reduce((a, b) => a + b, 0);
      stats.variance = variance(numericValues);
      stats.stdDev = stdDev(numericValues);
      stats.q1 = quartile(numericValues, 0.25);
      stats.q3 = quartile(numericValues, 0.75);
      stats.iqr = stats.q3 - stats.q1;
      stats.skewness = skewness(numericValues);
      stats.kurtosis = kurtosis(numericValues);
    }
  }

  if (type === 'string' || type === 'mixed') {
    const frequency = {};
    nonNullValues.forEach((v) => {
      const key = String(v);
      frequency[key] = (frequency[key] || 0) + 1;
    });

    const sorted = Object.entries(frequency).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0) {
      stats.mostCommon = sorted[0][0];
      stats.leastCommon = sorted[sorted.length - 1][0];
    }
  }

  return stats;
}

export function datasetSummary(data, columns) {
  const columnStats = columns.map((column) => calculateColumnStats(data, column));
  const numericColumns = columnStats.filter((s) => s.type === 'numeric');
  const totalMissing = columnStats.reduce((sum, s) => sum + s.missing, 0);
  const totalCells = data.length * columns.length;

  return {
    totalRows: data.length,
    totalColumns: columns.length,
    numericColumns: numericColumns.length,
    categoricalColumns: columnStats.length - numericColumns.length,
    missingValues: totalMissing,
    missingPercent: totalCells > 0 ? ((totalMissing / totalCells) * 100).toFixed(2) : '0',
  };
}

// Probability calculations
export function probability(favorable, total) {
  if (total === 0) return 0;
  return favorable / total;
}

export function factorial(n) {
  if (n <= 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

export function combinations(n, r) {
  if (r > n) return 0;
  return factorial(n) / (factorial(r) * factorial(n - r));
}

export function permutations(n, r) {
  if (r > n) return 0;
  return factorial(n) / factorial(n - r);
}

export function binomialProbability(n, k, p) {
  return combinations(n, k) * Math.pow(p, k) * Math.pow(1 - p, n - k);
}

export function poissonProbability(lambda, k) {
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

export function normalPDF(x, mean, stdDev) {
  const coefficient = 1 / (stdDev * Math.sqrt(2 * Math.PI));
  const exponent = -0.5 * Math.pow((x - mean) / stdDev, 2);
  return coefficient * Math.exp(exponent);
}

export function zScore(value, mean, stdDev) {
  if (stdDev === 0) return 0;
  return (value - mean) / stdDev;
}

export function correlation(xValues, yValues) {
  if (xValues.length !== yValues.length || xValues.length === 0) return 0;

  const n = xValues.length;
  const meanX = mean(xValues);
  const meanY = mean(yValues);

  let numerator = 0;
  let denomX = 0;
  let denomY = 0;

  for (let i = 0; i < n; i++) {
    const dx = xValues[i] - meanX;
    const dy = yValues[i] - meanY;
    numerator += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }

  const denominator = Math.sqrt(denomX * denomY);
  if (denominator === 0) return 0;
  return numerator / denominator;
}

export function covariance(xValues, yValues) {
  if (xValues.length !== yValues.length || xValues.length === 0) return 0;

  const n = xValues.length;
  const meanX = mean(xValues);
  const meanY = mean(yValues);

  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += (xValues[i] - meanX) * (yValues[i] - meanY);
  }
  return sum / n;
}

/** Columns holding at least one numeric value (Probability + Visualization views). */
export function numericColumnsFor(data, columns) {
  return columns.filter((col) => {
    const values = data.map((row) => row[col]).filter((v) => v !== null && v !== '');
    return values.some((v) => !isNaN(Number(v)));
  });
}

export interface DataRow {
  [key: string]: string | number | boolean | null;
}

export interface ColumnStats {
  name: string;
  type: 'numeric' | 'string' | 'boolean' | 'mixed';
  count: number;
  missing: number;
  unique: number;
  // Numeric stats
  mean?: number;
  median?: number;
  mode?: number | string;
  min?: number;
  max?: number;
  range?: number;
  sum?: number;
  variance?: number;
  stdDev?: number;
  q1?: number;
  q3?: number;
  iqr?: number;
  skewness?: number;
  kurtosis?: number;
  // String stats
  mostCommon?: string;
  leastCommon?: string;
}

export interface DatasetInfo {
  fileName: string;
  rowCount: number;
  columnCount: number;
  columns: string[];
  uploadedAt: Date;
}

export interface ChartConfig {
  type: 'bar' | 'line' | 'pie' | 'scatter' | 'histogram' | 'box';
  xAxis?: string;
  yAxis?: string;
  title?: string;
}

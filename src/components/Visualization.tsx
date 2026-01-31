import { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  AreaChart,
  Area
} from 'recharts';
import { BarChart2, LineChartIcon, PieChartIcon, ScatterChartIcon, TrendingUp, Activity } from 'lucide-react';

type ChartType = 'bar' | 'line' | 'pie' | 'scatter' | 'area' | 'histogram';

const COLORS = [
  '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
  '#f43f5e', '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#84cc16', '#22c55e', '#10b981', '#14b8a6', '#06b6d4',
  '#0ea5e9', '#3b82f6', '#6366f1'
];

export function Visualization() {
  const { data, datasetInfo } = useData();
  const [chartType, setChartType] = useState<ChartType>('bar');
  const [xAxis, setXAxis] = useState<string>('');
  const [yAxis, setYAxis] = useState<string>('');
  const [aggregation, setAggregation] = useState<'sum' | 'avg' | 'count' | 'min' | 'max'>('sum');

  const columns = datasetInfo?.columns || [];

  const numericColumns = useMemo(() => {
    if (!datasetInfo || data.length === 0) return [];
    return datasetInfo.columns.filter(col => {
      const values = data.map(row => row[col]).filter(v => v !== null && v !== '');
      return values.some(v => !isNaN(Number(v)));
    });
  }, [data, datasetInfo]);

  const chartData = useMemo(() => {
    if (!xAxis || data.length === 0) return [];

    if (chartType === 'scatter') {
      if (!yAxis) return [];
      return data
        .map(row => ({
          x: Number(row[xAxis]),
          y: Number(row[yAxis]),
          name: `${row[xAxis]}, ${row[yAxis]}`
        }))
        .filter(d => !isNaN(d.x) && !isNaN(d.y))
        .slice(0, 500); // Limit for performance
    }

    if (chartType === 'histogram') {
      const values = data
        .map(row => Number(row[xAxis]))
        .filter(v => !isNaN(v));
      
      if (values.length === 0) return [];
      
      const min = Math.min(...values);
      const max = Math.max(...values);
      const binCount = Math.min(20, Math.ceil(Math.sqrt(values.length)));
      const binWidth = (max - min) / binCount;
      
      const bins: { range: string; count: number }[] = [];
      for (let i = 0; i < binCount; i++) {
        const binMin = min + i * binWidth;
        const binMax = min + (i + 1) * binWidth;
        const count = values.filter(v => v >= binMin && (i === binCount - 1 ? v <= binMax : v < binMax)).length;
        bins.push({
          range: `${binMin.toFixed(1)}-${binMax.toFixed(1)}`,
          count
        });
      }
      return bins;
    }

    // Aggregate data for bar, line, area, pie charts
    const aggregated = new Map<string, { sum: number; count: number; values: number[] }>();
    
    data.forEach(row => {
      const key = String(row[xAxis] ?? 'Unknown');
      const value = yAxis ? Number(row[yAxis]) : 1;
      
      if (!aggregated.has(key)) {
        aggregated.set(key, { sum: 0, count: 0, values: [] });
      }
      
      const agg = aggregated.get(key)!;
      if (!isNaN(value)) {
        agg.sum += value;
        agg.count++;
        agg.values.push(value);
      } else {
        agg.count++;
      }
    });

    return Array.from(aggregated.entries())
      .map(([name, agg]) => {
        let value: number;
        switch (aggregation) {
          case 'sum':
            value = agg.sum;
            break;
          case 'avg':
            value = agg.values.length > 0 ? agg.sum / agg.values.length : 0;
            break;
          case 'count':
            value = agg.count;
            break;
          case 'min':
            value = agg.values.length > 0 ? Math.min(...agg.values) : 0;
            break;
          case 'max':
            value = agg.values.length > 0 ? Math.max(...agg.values) : 0;
            break;
          default:
            value = agg.sum;
        }
        return { name, value };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 50); // Limit categories for readability
  }, [data, xAxis, yAxis, chartType, aggregation]);

  const chartTypes = [
    { id: 'bar', label: 'Bar', icon: BarChart2 },
    { id: 'line', label: 'Line', icon: LineChartIcon },
    { id: 'area', label: 'Area', icon: Activity },
    { id: 'pie', label: 'Pie', icon: PieChartIcon },
    { id: 'scatter', label: 'Scatter', icon: ScatterChartIcon },
    { id: 'histogram', label: 'Histogram', icon: TrendingUp },
  ];

  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        No data loaded. Please upload a file first.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Chart Type Selection */}
      <div className="flex flex-wrap gap-2 bg-white p-2 rounded-xl border border-gray-200">
        {chartTypes.map(type => (
          <button
            key={type.id}
            onClick={() => setChartType(type.id as ChartType)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              chartType === type.id
                ? 'bg-indigo-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <type.icon className="w-4 h-4" />
            {type.label}
          </button>
        ))}
      </div>

      {/* Configuration */}
      <div className="bg-white p-4 rounded-xl border border-gray-200">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Chart Configuration</h3>
        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              {chartType === 'histogram' ? 'Column' : 'X-Axis / Category'}
            </label>
            <select
              value={xAxis}
              onChange={(e) => setXAxis(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="">Select column...</option>
              {(chartType === 'histogram' || chartType === 'scatter' ? numericColumns : columns).map(col => (
                <option key={col} value={col}>{col}</option>
              ))}
            </select>
          </div>

          {chartType !== 'histogram' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                {chartType === 'scatter' ? 'Y-Axis' : 'Value Column (optional)'}
              </label>
              <select
                value={yAxis}
                onChange={(e) => setYAxis(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="">Select column...</option>
                {numericColumns.map(col => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
            </div>
          )}

          {chartType !== 'scatter' && chartType !== 'histogram' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Aggregation</label>
              <select
                value={aggregation}
                onChange={(e) => setAggregation(e.target.value as typeof aggregation)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="sum">Sum</option>
                <option value="avg">Average</option>
                <option value="count">Count</option>
                <option value="min">Min</option>
                <option value="max">Max</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Chart Display */}
      <div className="bg-white p-6 rounded-xl border border-gray-200">
        {chartData.length === 0 ? (
          <div className="h-96 flex items-center justify-center text-gray-400">
            Select columns to generate chart
          </div>
        ) : (
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              {chartType === 'bar' && (
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis 
                    dataKey="name" 
                    tick={{ fontSize: 12 }} 
                    angle={-45} 
                    textAnchor="end" 
                    height={80}
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'white', 
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                    }} 
                  />
                  <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]}>
                    {chartData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              )}
              
              {chartType === 'line' && (
                <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis 
                    dataKey="name" 
                    tick={{ fontSize: 12 }} 
                    angle={-45} 
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'white', 
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px'
                    }} 
                  />
                  <Line 
                    type="monotone" 
                    dataKey="value" 
                    stroke="#6366f1" 
                    strokeWidth={2}
                    dot={{ fill: '#6366f1', strokeWidth: 2 }}
                  />
                </LineChart>
              )}
              
              {chartType === 'area' && (
                <AreaChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis 
                    dataKey="name" 
                    tick={{ fontSize: 12 }} 
                    angle={-45} 
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'white', 
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px'
                    }} 
                  />
                  <Area 
                    type="monotone" 
                    dataKey="value" 
                    stroke="#6366f1" 
                    fill="#c7d2fe"
                    strokeWidth={2}
                  />
                </AreaChart>
              )}
              
              {chartType === 'pie' && (
                <PieChart>
                  <Pie
                    data={chartData.slice(0, 12)}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`}
                    outerRadius={120}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {chartData.slice(0, 12).map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              )}
              
              {chartType === 'scatter' && (
                <ScatterChart margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis 
                    type="number" 
                    dataKey="x" 
                    name={xAxis} 
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis 
                    type="number" 
                    dataKey="y" 
                    name={yAxis} 
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip 
                    cursor={{ strokeDasharray: '3 3' }}
                    contentStyle={{ 
                      backgroundColor: 'white', 
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px'
                    }}
                  />
                  <Scatter name="Data" data={chartData} fill="#6366f1" />
                </ScatterChart>
              )}
              
              {chartType === 'histogram' && (
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis 
                    dataKey="range" 
                    tick={{ fontSize: 10 }} 
                    angle={-45} 
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'white', 
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px'
                    }}
                  />
                  <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { calculateColumnStats } from '../utils/statistics';
import { ColumnStats } from '../types/data';
import { BarChart3, Hash, Type, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';

function StatCard({ label, value, icon: Icon, color }: { 
  label: string; 
  value: string | number | undefined; 
  icon?: React.ElementType;
  color?: string;
}) {
  if (value === undefined || value === null) return null;
  
  const displayValue = typeof value === 'number' 
    ? (Number.isInteger(value) ? value : value.toFixed(4))
    : value;
    
  return (
    <div className="bg-white p-4 rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
      <div className="flex items-center gap-2 mb-1">
        {Icon && <Icon className={`w-4 h-4 ${color || 'text-gray-400'}`} />}
        <span className="text-xs text-gray-500 uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-lg font-semibold text-gray-800 truncate" title={String(displayValue)}>
        {displayValue}
      </p>
    </div>
  );
}

function ColumnStatsCard({ stats }: { stats: ColumnStats }) {
  const [expanded, setExpanded] = useState(false);
  
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${stats.type === 'numeric' ? 'bg-blue-100' : 'bg-green-100'}`}>
            {stats.type === 'numeric' ? (
              <Hash className="w-5 h-5 text-blue-600" />
            ) : (
              <Type className="w-5 h-5 text-green-600" />
            )}
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-gray-800">{stats.name}</h3>
            <p className="text-xs text-gray-500 capitalize">{stats.type} • {stats.count} values</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {stats.missing > 0 && (
            <div className="flex items-center gap-1 text-amber-600 text-sm">
              <AlertTriangle className="w-4 h-4" />
              {stats.missing} missing
            </div>
          )}
          <BarChart3 className={`w-5 h-5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </button>
      
      {expanded && (
        <div className="px-6 pb-6 border-t border-gray-100">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            <StatCard label="Count" value={stats.count} />
            <StatCard label="Unique" value={stats.unique} />
            <StatCard label="Missing" value={stats.missing} color={stats.missing > 0 ? 'text-amber-500' : undefined} />
            
            {stats.type === 'numeric' && (
              <>
                <StatCard label="Mean" value={stats.mean} icon={TrendingUp} color="text-blue-500" />
                <StatCard label="Median" value={stats.median} />
                <StatCard label="Mode" value={stats.mode} />
                <StatCard label="Min" value={stats.min} icon={TrendingDown} color="text-red-500" />
                <StatCard label="Max" value={stats.max} icon={TrendingUp} color="text-green-500" />
                <StatCard label="Range" value={stats.range} />
                <StatCard label="Sum" value={stats.sum} />
                <StatCard label="Std Dev" value={stats.stdDev} />
                <StatCard label="Variance" value={stats.variance} />
                <StatCard label="Q1 (25%)" value={stats.q1} />
                <StatCard label="Q3 (75%)" value={stats.q3} />
                <StatCard label="IQR" value={stats.iqr} />
                <StatCard label="Skewness" value={stats.skewness} />
                <StatCard label="Kurtosis" value={stats.kurtosis} />
              </>
            )}
            
            {(stats.type === 'string' || stats.type === 'mixed') && (
              <>
                <StatCard label="Most Common" value={stats.mostCommon} />
                <StatCard label="Least Common" value={stats.leastCommon} />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function Statistics() {
  const { data, datasetInfo } = useData();
  
  const columnStats = useMemo(() => {
    if (!datasetInfo || data.length === 0) return [];
    return datasetInfo.columns.map(col => calculateColumnStats(data, col));
  }, [data, datasetInfo]);
  
  const summaryStats = useMemo(() => {
    const numericColumns = columnStats.filter(s => s.type === 'numeric');
    const totalMissing = columnStats.reduce((sum, s) => sum + s.missing, 0);
    const totalCells = data.length * (datasetInfo?.columns.length || 0);
    
    return {
      totalRows: data.length,
      totalColumns: datasetInfo?.columns.length || 0,
      numericColumns: numericColumns.length,
      categoricalColumns: columnStats.length - numericColumns.length,
      missingValues: totalMissing,
      missingPercent: totalCells > 0 ? ((totalMissing / totalCells) * 100).toFixed(2) : '0',
    };
  }, [columnStats, data, datasetInfo]);

  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        No data loaded. Please upload a file first.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 text-white p-4 rounded-xl">
          <p className="text-indigo-200 text-sm">Total Rows</p>
          <p className="text-2xl font-bold">{summaryStats.totalRows.toLocaleString()}</p>
        </div>
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white p-4 rounded-xl">
          <p className="text-purple-200 text-sm">Total Columns</p>
          <p className="text-2xl font-bold">{summaryStats.totalColumns}</p>
        </div>
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-4 rounded-xl">
          <p className="text-blue-200 text-sm">Numeric Cols</p>
          <p className="text-2xl font-bold">{summaryStats.numericColumns}</p>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-600 text-white p-4 rounded-xl">
          <p className="text-green-200 text-sm">Categorical Cols</p>
          <p className="text-2xl font-bold">{summaryStats.categoricalColumns}</p>
        </div>
        <div className="bg-gradient-to-br from-amber-500 to-amber-600 text-white p-4 rounded-xl">
          <p className="text-amber-200 text-sm">Missing Values</p>
          <p className="text-2xl font-bold">{summaryStats.missingValues.toLocaleString()}</p>
        </div>
        <div className="bg-gradient-to-br from-rose-500 to-rose-600 text-white p-4 rounded-xl">
          <p className="text-rose-200 text-sm">Missing %</p>
          <p className="text-2xl font-bold">{summaryStats.missingPercent}%</p>
        </div>
      </div>

      {/* Column Statistics */}
      <div>
        <h2 className="text-xl font-semibold text-gray-800 mb-4">Column Statistics</h2>
        <p className="text-sm text-gray-500 mb-4">Click on a column to expand and see detailed statistics</p>
        <div className="space-y-3">
          {columnStats.map(stats => (
            <ColumnStatsCard key={stats.name} stats={stats} />
          ))}
        </div>
      </div>
    </div>
  );
}

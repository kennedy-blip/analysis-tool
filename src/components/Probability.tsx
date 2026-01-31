import { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { 
  probability, 
  combinations, 
  permutations, 
  binomialProbability, 
  poissonProbability,
  normalPDF,
  zScore,
  correlation,
  covariance,
  mean,
  stdDev
} from '../utils/statistics';
import { Calculator, Percent, Shuffle, Target, TrendingUp, BarChart2 } from 'lucide-react';

type ProbMode = 'basic' | 'binomial' | 'poisson' | 'normal' | 'correlation';

export function Probability() {
  const { data, datasetInfo } = useData();
  const [mode, setMode] = useState<ProbMode>('basic');
  
  // Basic probability
  const [favorable, setFavorable] = useState<number>(0);
  const [total, setTotal] = useState<number>(0);
  
  // Combinations/Permutations
  const [n, setN] = useState<number>(0);
  const [r, setR] = useState<number>(0);
  
  // Binomial
  const [binN, setBinN] = useState<number>(10);
  const [binK, setBinK] = useState<number>(5);
  const [binP, setBinP] = useState<number>(0.5);
  
  // Poisson
  const [lambda, setLambda] = useState<number>(5);
  const [poissonK, setPoissonK] = useState<number>(3);
  
  // Normal/Z-score
  const [normalX, setNormalX] = useState<number>(0);
  const [normalMean, setNormalMean] = useState<number>(0);
  const [normalStd, setNormalStd] = useState<number>(1);
  
  // Correlation
  const [xColumn, setXColumn] = useState<string>('');
  const [yColumn, setYColumn] = useState<string>('');

  const numericColumns = useMemo(() => {
    if (!datasetInfo || data.length === 0) return [];
    return datasetInfo.columns.filter(col => {
      const values = data.map(row => row[col]).filter(v => v !== null && v !== '');
      return values.some(v => !isNaN(Number(v)));
    });
  }, [data, datasetInfo]);

  const correlationResult = useMemo(() => {
    if (!xColumn || !yColumn || data.length === 0) return null;
    
    const xValues: number[] = [];
    const yValues: number[] = [];
    
    data.forEach(row => {
      const x = Number(row[xColumn]);
      const y = Number(row[yColumn]);
      if (!isNaN(x) && !isNaN(y)) {
        xValues.push(x);
        yValues.push(y);
      }
    });
    
    if (xValues.length < 2) return null;
    
    return {
      correlation: correlation(xValues, yValues),
      covariance: covariance(xValues, yValues),
      xMean: mean(xValues),
      yMean: mean(yValues),
      xStdDev: stdDev(xValues),
      yStdDev: stdDev(yValues),
      count: xValues.length
    };
  }, [xColumn, yColumn, data]);

  const tabs = [
    { id: 'basic', label: 'Basic', icon: Calculator },
    { id: 'binomial', label: 'Binomial', icon: Target },
    { id: 'poisson', label: 'Poisson', icon: Shuffle },
    { id: 'normal', label: 'Normal/Z', icon: TrendingUp },
    { id: 'correlation', label: 'Correlation', icon: BarChart2 },
  ];

  return (
    <div className="space-y-6">
      {/* Mode Tabs */}
      <div className="flex flex-wrap gap-2 bg-white p-2 rounded-xl border border-gray-200">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setMode(tab.id as ProbMode)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === tab.id
                ? 'bg-indigo-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Basic Probability */}
      {mode === 'basic' && (
        <div className="grid md:grid-cols-2 gap-6">
          {/* Simple Probability */}
          <div className="bg-white p-6 rounded-xl border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Percent className="w-5 h-5 text-indigo-500" />
              Simple Probability
            </h3>
            <p className="text-sm text-gray-500 mb-4">P(A) = Favorable Outcomes / Total Outcomes</p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Favorable Outcomes</label>
                <input
                  type="number"
                  value={favorable}
                  onChange={(e) => setFavorable(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Total Outcomes</label>
                <input
                  type="number"
                  value={total}
                  onChange={(e) => setTotal(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  min="1"
                />
              </div>
              
              <div className="p-4 bg-indigo-50 rounded-lg">
                <p className="text-sm text-indigo-600">Probability</p>
                <p className="text-2xl font-bold text-indigo-700">
                  {total > 0 ? (probability(favorable, total) * 100).toFixed(4) : 0}%
                </p>
                <p className="text-sm text-indigo-500">
                  {total > 0 ? probability(favorable, total).toFixed(6) : 0}
                </p>
              </div>
            </div>
          </div>

          {/* Combinations & Permutations */}
          <div className="bg-white p-6 rounded-xl border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Shuffle className="w-5 h-5 text-purple-500" />
              Combinations & Permutations
            </h3>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">n (total)</label>
                  <input
                    type="number"
                    value={n}
                    onChange={(e) => setN(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">r (choose)</label>
                  <input
                    type="number"
                    value={r}
                    onChange={(e) => setR(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    min="0"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-purple-50 rounded-lg">
                  <p className="text-sm text-purple-600">Combinations C(n,r)</p>
                  <p className="text-xl font-bold text-purple-700">
                    {n >= r && n <= 170 ? combinations(n, r).toLocaleString() : 'N/A'}
                  </p>
                  <p className="text-xs text-purple-500">Order doesn't matter</p>
                </div>
                <div className="p-4 bg-pink-50 rounded-lg">
                  <p className="text-sm text-pink-600">Permutations P(n,r)</p>
                  <p className="text-xl font-bold text-pink-700">
                    {n >= r && n <= 170 ? permutations(n, r).toLocaleString() : 'N/A'}
                  </p>
                  <p className="text-xs text-pink-500">Order matters</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Binomial Distribution */}
      {mode === 'binomial' && (
        <div className="bg-white p-6 rounded-xl border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-800 mb-2 flex items-center gap-2">
            <Target className="w-5 h-5 text-blue-500" />
            Binomial Distribution
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            P(X = k) = C(n,k) × p^k × (1-p)^(n-k)
          </p>
          
          <div className="grid md:grid-cols-3 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">n (trials)</label>
              <input
                type="number"
                value={binN}
                onChange={(e) => setBinN(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                min="1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">k (successes)</label>
              <input
                type="number"
                value={binK}
                onChange={(e) => setBinK(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                min="0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">p (probability)</label>
              <input
                type="number"
                step="0.01"
                value={binP}
                onChange={(e) => setBinP(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                min="0"
                max="1"
              />
            </div>
          </div>
          
          <div className="grid md:grid-cols-3 gap-4">
            <div className="p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-600">P(X = {binK})</p>
              <p className="text-2xl font-bold text-blue-700">
                {(binomialProbability(binN, binK, binP) * 100).toFixed(4)}%
              </p>
            </div>
            <div className="p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-600">Expected Value (μ)</p>
              <p className="text-2xl font-bold text-blue-700">{(binN * binP).toFixed(4)}</p>
            </div>
            <div className="p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-600">Std Dev (σ)</p>
              <p className="text-2xl font-bold text-blue-700">
                {Math.sqrt(binN * binP * (1 - binP)).toFixed(4)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Poisson Distribution */}
      {mode === 'poisson' && (
        <div className="bg-white p-6 rounded-xl border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-800 mb-2 flex items-center gap-2">
            <Shuffle className="w-5 h-5 text-green-500" />
            Poisson Distribution
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            P(X = k) = (λ^k × e^(-λ)) / k!
          </p>
          
          <div className="grid md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">λ (lambda - avg rate)</label>
              <input
                type="number"
                step="0.1"
                value={lambda}
                onChange={(e) => setLambda(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                min="0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">k (occurrences)</label>
              <input
                type="number"
                value={poissonK}
                onChange={(e) => setPoissonK(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                min="0"
              />
            </div>
          </div>
          
          <div className="grid md:grid-cols-3 gap-4">
            <div className="p-4 bg-green-50 rounded-lg">
              <p className="text-sm text-green-600">P(X = {poissonK})</p>
              <p className="text-2xl font-bold text-green-700">
                {(poissonProbability(lambda, poissonK) * 100).toFixed(4)}%
              </p>
            </div>
            <div className="p-4 bg-green-50 rounded-lg">
              <p className="text-sm text-green-600">Expected Value (μ)</p>
              <p className="text-2xl font-bold text-green-700">{lambda}</p>
            </div>
            <div className="p-4 bg-green-50 rounded-lg">
              <p className="text-sm text-green-600">Std Dev (σ)</p>
              <p className="text-2xl font-bold text-green-700">{Math.sqrt(lambda).toFixed(4)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Normal Distribution / Z-Score */}
      {mode === 'normal' && (
        <div className="bg-white p-6 rounded-xl border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-800 mb-2 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-amber-500" />
            Normal Distribution & Z-Score
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            Z = (X - μ) / σ
          </p>
          
          <div className="grid md:grid-cols-3 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">X (value)</label>
              <input
                type="number"
                step="0.1"
                value={normalX}
                onChange={(e) => setNormalX(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">μ (mean)</label>
              <input
                type="number"
                step="0.1"
                value={normalMean}
                onChange={(e) => setNormalMean(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">σ (std dev)</label>
              <input
                type="number"
                step="0.1"
                value={normalStd}
                onChange={(e) => setNormalStd(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                min="0.001"
              />
            </div>
          </div>
          
          <div className="grid md:grid-cols-2 gap-4">
            <div className="p-4 bg-amber-50 rounded-lg">
              <p className="text-sm text-amber-600">Z-Score</p>
              <p className="text-2xl font-bold text-amber-700">
                {zScore(normalX, normalMean, normalStd).toFixed(4)}
              </p>
            </div>
            <div className="p-4 bg-amber-50 rounded-lg">
              <p className="text-sm text-amber-600">PDF f(x)</p>
              <p className="text-2xl font-bold text-amber-700">
                {normalPDF(normalX, normalMean, normalStd).toFixed(6)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Correlation Analysis */}
      {mode === 'correlation' && (
        <div className="bg-white p-6 rounded-xl border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-800 mb-2 flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-rose-500" />
            Correlation Analysis
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            Analyze the relationship between two numeric columns from your dataset
          </p>
          
          {numericColumns.length < 2 ? (
            <div className="p-4 bg-gray-50 rounded-lg text-gray-500">
              Please upload a dataset with at least 2 numeric columns to use correlation analysis.
            </div>
          ) : (
            <>
              <div className="grid md:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">X Column</label>
                  <select
                    value={xColumn}
                    onChange={(e) => setXColumn(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value="">Select column...</option>
                    {numericColumns.map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Y Column</label>
                  <select
                    value={yColumn}
                    onChange={(e) => setYColumn(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value="">Select column...</option>
                    {numericColumns.map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              {correlationResult && (
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="p-4 bg-rose-50 rounded-lg">
                    <p className="text-sm text-rose-600">Pearson Correlation (r)</p>
                    <p className="text-2xl font-bold text-rose-700">
                      {correlationResult.correlation.toFixed(4)}
                    </p>
                    <p className="text-xs text-rose-500 mt-1">
                      {Math.abs(correlationResult.correlation) > 0.7 ? 'Strong' : 
                       Math.abs(correlationResult.correlation) > 0.3 ? 'Moderate' : 'Weak'}
                      {correlationResult.correlation >= 0 ? ' Positive' : ' Negative'}
                    </p>
                  </div>
                  <div className="p-4 bg-rose-50 rounded-lg">
                    <p className="text-sm text-rose-600">Covariance</p>
                    <p className="text-2xl font-bold text-rose-700">
                      {correlationResult.covariance.toFixed(4)}
                    </p>
                  </div>
                  <div className="p-4 bg-rose-50 rounded-lg">
                    <p className="text-sm text-rose-600">R² (Coefficient of Determination)</p>
                    <p className="text-2xl font-bold text-rose-700">
                      {(Math.pow(correlationResult.correlation, 2) * 100).toFixed(2)}%
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

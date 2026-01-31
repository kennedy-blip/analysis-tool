import { useData } from '../context/DataContext';
import { FileUpload } from './FileUpload';
import { FileSpreadsheet, Calendar, Rows3, Columns3, HardDrive, Trash2, Sparkles } from 'lucide-react';

export function DataOverview() {
  const { data, datasetInfo, setData, setDatasetInfo, isLoading } = useData();

  const handleClearData = () => {
    setData([]);
    setDatasetInfo(null);
  };

  const generateSampleData = () => {
    const categories = ['Electronics', 'Clothing', 'Food', 'Books', 'Sports', 'Home', 'Beauty', 'Toys'];
    const regions = ['North', 'South', 'East', 'West', 'Central'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    const sampleData = Array.from({ length: 200 }, (_, i) => ({
      id: i + 1,
      product: `Product ${String.fromCharCode(65 + (i % 26))}${Math.floor(i / 26) + 1}`,
      category: categories[Math.floor(Math.random() * categories.length)],
      region: regions[Math.floor(Math.random() * regions.length)],
      month: months[Math.floor(Math.random() * months.length)],
      sales: Math.round(Math.random() * 10000 + 500),
      quantity: Math.floor(Math.random() * 100 + 1),
      price: Math.round((Math.random() * 200 + 10) * 100) / 100,
      rating: Math.round((Math.random() * 4 + 1) * 10) / 10,
      inStock: Math.random() > 0.2 ? 'Yes' : 'No'
    }));

    setData(sampleData);
    setDatasetInfo({
      fileName: 'sample_sales_data.csv',
      rowCount: sampleData.length,
      columnCount: Object.keys(sampleData[0]).length,
      columns: Object.keys(sampleData[0]),
      uploadedAt: new Date(),
    });
  };

  const estimatedSize = data.length > 0 
    ? (JSON.stringify(data).length / 1024).toFixed(2) 
    : '0';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
          <p className="text-gray-600">Processing your file...</p>
        </div>
      </div>
    );
  }

  if (!datasetInfo || data.length === 0) {
    return (
      <div className="space-y-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Welcome to DataLens</h2>
          <p className="text-gray-500 max-w-lg mx-auto">
            Upload your Excel or CSV file to start analyzing your data. We'll help you compute statistics, 
            calculate probabilities, and visualize your data.
          </p>
        </div>
        <FileUpload />
        
                {/* Try with sample data */}
        <div className="text-center mt-6">
          <p className="text-sm text-gray-500 mb-3">Don't have a file? Try with sample data:</p>
          <button
            onClick={generateSampleData}
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-medium hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg shadow-indigo-200"
          >
            <Sparkles className="w-5 h-5" />
            Generate Sample Dataset
          </button>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mt-12">
          <div className="bg-white p-6 rounded-xl border border-gray-200 text-center">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-4">
              <Rows3 className="w-6 h-6 text-blue-600" />
            </div>
            <h3 className="font-semibold text-gray-800 mb-2">Statistical Analysis</h3>
            <p className="text-sm text-gray-500">
              Compute mean, median, mode, variance, standard deviation, quartiles, and more.
            </p>
          </div>
          <div className="bg-white p-6 rounded-xl border border-gray-200 text-center">
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mx-auto mb-4">
              <Columns3 className="w-6 h-6 text-purple-600" />
            </div>
            <h3 className="font-semibold text-gray-800 mb-2">Probability Tools</h3>
            <p className="text-sm text-gray-500">
              Calculate binomial, Poisson, and normal distributions, plus correlation analysis.
            </p>
          </div>
          <div className="bg-white p-6 rounded-xl border border-gray-200 text-center">
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-4">
              <FileSpreadsheet className="w-6 h-6 text-green-600" />
            </div>
            <h3 className="font-semibold text-gray-800 mb-2">Data Visualization</h3>
            <p className="text-sm text-gray-500">
              Create bar charts, line graphs, pie charts, scatter plots, and histograms.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Dataset Info Card */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-6 rounded-2xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/20 rounded-xl">
              <FileSpreadsheet className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-xl font-bold">{datasetInfo.fileName}</h2>
              <p className="text-indigo-200 text-sm">Uploaded successfully</p>
            </div>
          </div>
          <button
            onClick={handleClearData}
            className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors text-sm"
          >
            <Trash2 className="w-4 h-4" />
            Clear & Upload New
          </button>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <div className="bg-white/10 p-4 rounded-xl">
            <div className="flex items-center gap-2 text-indigo-200 text-sm mb-1">
              <Rows3 className="w-4 h-4" />
              Rows
            </div>
            <p className="text-2xl font-bold">{datasetInfo.rowCount.toLocaleString()}</p>
          </div>
          <div className="bg-white/10 p-4 rounded-xl">
            <div className="flex items-center gap-2 text-indigo-200 text-sm mb-1">
              <Columns3 className="w-4 h-4" />
              Columns
            </div>
            <p className="text-2xl font-bold">{datasetInfo.columnCount}</p>
          </div>
          <div className="bg-white/10 p-4 rounded-xl">
            <div className="flex items-center gap-2 text-indigo-200 text-sm mb-1">
              <Calendar className="w-4 h-4" />
              Uploaded
            </div>
            <p className="text-lg font-semibold">
              {datasetInfo.uploadedAt.toLocaleTimeString()}
            </p>
          </div>
          <div className="bg-white/10 p-4 rounded-xl">
            <div className="flex items-center gap-2 text-indigo-200 text-sm mb-1">
              <HardDrive className="w-4 h-4" />
              Size
            </div>
            <p className="text-lg font-semibold">~{estimatedSize} KB</p>
          </div>
        </div>
      </div>

      {/* Columns List */}
      <div className="bg-white p-6 rounded-xl border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Dataset Columns</h3>
        <div className="flex flex-wrap gap-2">
          {datasetInfo.columns.map((col, idx) => (
            <span
              key={col}
              className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium"
            >
              {idx + 1}. {col}
            </span>
          ))}
        </div>
      </div>

      {/* Quick Upload */}
      <div className="bg-gray-50 p-6 rounded-xl border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Upload Different File</h3>
        <FileUpload />
      </div>
    </div>
  );
}

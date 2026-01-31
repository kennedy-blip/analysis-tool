import { useCallback, useState } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet, X, AlertCircle } from 'lucide-react';
import { useData } from '../context/DataContext';
import { DataRow } from '../types/data';

export function FileUpload() {
  const { setData, setDatasetInfo, setIsLoading } = useData();
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processFile = useCallback(async (file: File) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const extension = file.name.split('.').pop()?.toLowerCase();
      
      if (!['xlsx', 'xls', 'csv'].includes(extension || '')) {
        throw new Error('Please upload an Excel (.xlsx, .xls) or CSV file');
      }

      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as DataRow[];
      
      if (jsonData.length === 0) {
        throw new Error('The file appears to be empty');
      }

      const columns = Object.keys(jsonData[0]);
      
      setData(jsonData);
      setDatasetInfo({
        fileName: file.name,
        rowCount: jsonData.length,
        columnCount: columns.length,
        columns,
        uploadedAt: new Date(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error processing file');
    } finally {
      setIsLoading(false);
    }
  }, [setData, setDatasetInfo, setIsLoading]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  }, [processFile]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  }, [processFile]);

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-200 ${
          dragActive
            ? 'border-indigo-500 bg-indigo-50'
            : 'border-gray-300 hover:border-gray-400 bg-white'
        }`}
      >
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        
        <div className="flex flex-col items-center gap-4">
          <div className={`p-4 rounded-full ${dragActive ? 'bg-indigo-100' : 'bg-gray-100'}`}>
            {dragActive ? (
              <FileSpreadsheet className="w-10 h-10 text-indigo-600" />
            ) : (
              <Upload className="w-10 h-10 text-gray-500" />
            )}
          </div>
          
          <div>
            <p className="text-lg font-semibold text-gray-700">
              {dragActive ? 'Drop your file here' : 'Drag & drop your file here'}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              or click to browse
            </p>
          </div>
          
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <FileSpreadsheet className="w-4 h-4" />
            <span>Supports: .xlsx, .xls, .csv</span>
          </div>
        </div>
      </div>
      
      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-red-700 text-sm">{error}</p>
          <button
            onClick={() => setError(null)}
            className="ml-auto p-1 hover:bg-red-100 rounded"
          >
            <X className="w-4 h-4 text-red-500" />
          </button>
        </div>
      )}
    </div>
  );
}

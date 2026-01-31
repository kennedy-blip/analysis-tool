import { createContext, useContext, useState, ReactNode } from 'react';
import { DataRow, DatasetInfo } from '../types/data';

interface DataContextType {
  data: DataRow[];
  setData: (data: DataRow[]) => void;
  datasetInfo: DatasetInfo | null;
  setDatasetInfo: (info: DatasetInfo | null) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<DataRow[]>([]);
  const [datasetInfo, setDatasetInfo] = useState<DatasetInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  return (
    <DataContext.Provider value={{ 
      data, 
      setData, 
      datasetInfo, 
      setDatasetInfo,
      isLoading,
      setIsLoading
    }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
}

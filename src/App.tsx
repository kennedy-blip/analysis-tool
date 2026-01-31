import { useState } from 'react';
import { DataProvider, useData } from './context/DataContext';
import { DataOverview } from './components/DataOverview';
import { DataTable } from './components/DataTable';
import { Statistics } from './components/Statistics';
import { Probability } from './components/Probability';
import { Visualization } from './components/Visualization';
import { 
  LayoutDashboard, 
  Table2, 
  BarChart3, 
  Calculator, 
  PieChart,
  Menu,
  X,
  Database
} from 'lucide-react';

type Tab = 'overview' | 'data' | 'statistics' | 'probability' | 'visualization';

function AppContent() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { datasetInfo } = useData();

  const tabs = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'data', label: 'Data Table', icon: Table2 },
    { id: 'statistics', label: 'Statistics', icon: BarChart3 },
    { id: 'probability', label: 'Probability', icon: Calculator },
    { id: 'visualization', label: 'Visualization', icon: PieChart },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return <DataOverview />;
      case 'data':
        return <DataTable />;
      case 'statistics':
        return <Statistics />;
      case 'probability':
        return <Probability />;
      case 'visualization':
        return <Visualization />;
      default:
        return <DataOverview />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Mobile Menu Button */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-lg shadow-md"
      >
        {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      {/* Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-40
        w-64 bg-white border-r border-gray-200 flex flex-col
        transform transition-transform duration-200 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Logo */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl">
              <Database className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-xl text-gray-800">DataLens</h1>
              <p className="text-xs text-gray-500">Data Analysis Tool</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4">
          <ul className="space-y-1">
            {tabs.map(tab => (
              <li key={tab.id}>
                <button
                  onClick={() => {
                    setActiveTab(tab.id as Tab);
                    setSidebarOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors ${
                    activeTab === tab.id
                      ? 'bg-indigo-50 text-indigo-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <tab.icon className={`w-5 h-5 ${activeTab === tab.id ? 'text-indigo-600' : 'text-gray-400'}`} />
                  {tab.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Dataset Status */}
        <div className="p-4 border-t border-gray-200">
          {datasetInfo ? (
            <div className="p-4 bg-green-50 rounded-xl">
              <p className="text-xs text-green-600 font-medium mb-1">DATASET LOADED</p>
              <p className="text-sm text-green-800 font-semibold truncate">{datasetInfo.fileName}</p>
              <p className="text-xs text-green-600">
                {datasetInfo.rowCount.toLocaleString()} rows × {datasetInfo.columnCount} cols
              </p>
            </div>
          ) : (
            <div className="p-4 bg-gray-100 rounded-xl">
              <p className="text-xs text-gray-500 font-medium mb-1">NO DATASET</p>
              <p className="text-sm text-gray-700">Upload a file to start</p>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-h-screen">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-6 py-4 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="pl-12 lg:pl-0">
              <h2 className="text-xl font-bold text-gray-800">
                {tabs.find(t => t.id === activeTab)?.label}
              </h2>
              <p className="text-sm text-gray-500">
                {activeTab === 'overview' && 'Upload and manage your datasets'}
                {activeTab === 'data' && 'Browse and search through your data'}
                {activeTab === 'statistics' && 'View comprehensive statistical analysis'}
                {activeTab === 'probability' && 'Calculate probabilities and distributions'}
                {activeTab === 'visualization' && 'Create charts and visualizations'}
              </p>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="p-6 lg:p-8">
          {renderContent()}
        </div>
      </main>
    </div>
  );
}

export function App() {
  return (
    <DataProvider>
      <AppContent />
    </DataProvider>
  );
}

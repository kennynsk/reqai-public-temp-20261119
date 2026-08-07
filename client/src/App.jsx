import { useState } from 'react';
import BizReqResearcher from './BizReqResearcher.jsx';
import RequirementsDecomposer from './RequirementsDecomposer.jsx';
import AsyncJobWorkspace from './AsyncJobWorkspace.jsx';

const TABS = [
  { key: 'decomposer', label: 'Бизнес-требования' },
  { key: 'researcher', label: 'Исследование рынка' },
];

function App() {
  const [activeModule, setActiveModule] = useState('decomposer');
  if (import.meta.env.VITE_ASYNC_PLATFORM_ENABLED === 'true') return <AsyncJobWorkspace />;

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center h-14 gap-6">
            <span className="text-sm font-bold text-gray-900 tracking-tight mr-4">ReqAI</span>
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveModule(tab.key)}
                className={`h-14 px-1 text-sm font-medium border-b-2 transition-colors ${
                  activeModule === tab.key
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {activeModule === 'decomposer' && <RequirementsDecomposer />}
      {activeModule === 'researcher' && <BizReqResearcher />}
    </div>
  );
}

export default App;

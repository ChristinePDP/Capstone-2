import { useState } from 'react';
import RawTab from '../components/inventory/RawTab';
import CelebrationTab from '../components/inventory/CelebrationTab';
import RecipeTab from '../components/inventory/RecipeTab';
import WasteTab from '../components/inventory/WasteTab';
import ProductLogTab from '../components/inventory/ProductLogTab';

const MAIN_TABS = [
  { key: 'stocks', label: 'Stocks' },
  { key: 'waste',  label: 'Waste Log' },
];

const STOCK_SUBTABS = [
  { key: 'raw',     label: ' Ingredients' },
  { key: 'celeb',  label: 'Celebration / Product Materials' },
  { key: 'recipe', label: 'Production Formula' },
  { key: 'product', label: 'Production Log' },
];

export default function InventoryPage() {
  // ── 1. Kukunin muna sa localStorage ang huling napiling tab ──
  const [mainTab, setMainTab] = useState(() => {
    return localStorage.getItem('inv_main_tab') || 'stocks';
  });

  const [subTab, setSubTab] = useState(() => {
    return localStorage.getItem('inv_sub_tab') || 'raw';
  });

  // ── 2. Helper functions para mag-save sa localStorage kapag nagpalit ng tab ──
  const handleMainTabChange = (key) => {
    setMainTab(key);
    localStorage.setItem('inv_main_tab', key);
  };

  const handleSubTabChange = (key) => {
    setSubTab(key);
    localStorage.setItem('inv_sub_tab', key);
  };

  return (
    <div className="space-y-6">
      {/* 1. MAIN TABS (Stocks | Waste Log) */}
      <div className="flex gap-1 bg-brand-100 rounded-xl p-1 w-fit border border-brand-200">
        {MAIN_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => handleMainTabChange(tab.key)}
            className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${
              mainTab === tab.key
                ? 'bg-white text-brand-900 shadow-sm'
                : 'text-brand-500 hover:text-brand-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* STOCKS VIEW: SUBTABS -> TABLE */}
      {mainTab === 'stocks' && (
        <div className="space-y-6 ">
          
          {/* 2. SUB TABS */}
          <div className="flex gap-6 border-b-2 border-brand-100 px-2">
            {STOCK_SUBTABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => handleSubTabChange(tab.key)}
                className={`pb-3 text-sm font-bold border-b-2 transition-all -mb-0.5 ${
                  subTab === tab.key
                    ? 'border-brand-800 text-brand-900'
                    : 'border-transparent text-brand-400 hover:text-brand-600'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* 3. CONTENT TABLES */}
          <div className="pt-2">
            {subTab === 'raw'     && <RawTab />}
            {subTab === 'celeb'   && <CelebrationTab />}
            {subTab === 'recipe'  && <RecipeTab />}
            {subTab === 'product' && <ProductLogTab />}
          </div>
        </div>
      )}

      {/* WASTE LOG VIEW */}
      {mainTab === 'waste' && <WasteTab />}
    </div>
  );
}
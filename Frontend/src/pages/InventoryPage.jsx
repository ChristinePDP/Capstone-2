import { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Card } from '../components/ui/index';
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
  { key: 'raw',     label: 'Raw Ingredients' },
  { key: 'celeb',  label: 'Celebration Materials' },
  { key: 'recipe', label: 'Recipe Log' },
  { key: 'product', label: 'Product Log' },
];

export default function InventoryPage() {
  const [mainTab, setMainTab] = useState('stocks');
  const [subTab, setSubTab]   = useState('raw');

  // Kukunin natin ang data mula sa AppContext para sa dynamic KPI
  const { ingredients = [], materials = [], recipes = [], productionLogs = [] } = useApp();

  // Dynamic KPI logic base sa kung anong sub-tab ang naka-active
  const kpiData = useMemo(() => {
    if (mainTab !== 'stocks') return null;

    if (subTab === 'raw') {
      const low = ingredients.filter(i => i.stock < i.min * 2).length;
      return [
        { label: 'Total Ingredients', val: ingredients.length, color: '' },
        { label: 'Low Stock Ingredients', val: low, color: 'danger' }
      ];
    }
    if (subTab === 'celeb') {
      const low = materials.filter(m => m.stock < m.min * 2).length;
      return [
        { label: 'Total Celebration Materials', val: materials.length, color: '' },
        { label: 'Low Stock Materials', val: low, color: 'danger' }
      ];
    }
    if (subTab === 'recipe') {
      return [
        { label: 'Total Registered Recipes', val: recipes.length, color: '' }
      ];
    }
    if (subTab === 'product') {
      const todayStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const todayCount = productionLogs.filter(pl => pl.dt?.includes(todayStr.split(',')[0]) && pl.dt?.includes(todayStr.split(', ')[1])).length;
      return [
        { label: 'Total Production Entries', val: productionLogs.length, color: '' },
        { label: 'Produced Today', val: todayCount, color: '' },
      ];
    }
    return [];
  }, [mainTab, subTab, ingredients, materials, recipes, productionLogs]);

  return (
    <div className="space-y-6">
      {/* 1. MAIN TABS (Stocks | Waste Log) */}
      <div className="flex gap-1 bg-brand-100 rounded-xl p-1 w-fit border border-brand-200">
        {MAIN_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setMainTab(tab.key)}
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

      {/* STOCKS VIEW: KPI -> SUBTABS -> TABLE */}
      {mainTab === 'stocks' && (
        <div className="space-y-6 ">
          
          {/* 2. DYNAMIC KPI CARDS (Nasa taas) */}
          {kpiData && (
            // Dynamic grid columns: Kung 1 lang ang laman ng array, magiging grid-cols-1 siya
            <div className={` grid gap-4 ${kpiData.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {kpiData.map((kpi, idx) => (
                <Card key={idx} className="p-5">
                  <p className={` text-[11px] font-bold uppercase tracking-wider mb-2 ${
                    kpi.color === 'danger' ? 'text-red-500' : 'text-brand-400'
                  }`}>{kpi.label}</p>
                  <p className={` text-3xl font-bold ${
                    kpi.color === 'danger' ? 'text-red-600' : 'text-brand-800'
                  }`}>{kpi.val}</p>
                </Card>
              ))}
            </div>
          )}

          {/* 3. SUB TABS (Nasa baba ng KPI) */}
          <div className="flex gap-6 border-b-2 border-brand-100 px-2">
            {STOCK_SUBTABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setSubTab(tab.key)}
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

          {/* 4. CONTENT TABLES */}
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
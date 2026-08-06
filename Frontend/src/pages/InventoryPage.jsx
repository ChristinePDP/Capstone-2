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
      // Ikumpara ang aktwal na petsa (Asia/Manila) sa halip na mag-substring
      // match ng localized string laban sa raw ISO timestamp — hindi kasi
      // talaga nagtutugma ang mga format nun kaya laging 0 ang resulta dati.
      const manilaDateKey = (dateInput) => {
        if (!dateInput) return null;
        return new Date(dateInput).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }); // 'YYYY-MM-DD'
      };
      const todayKey = manilaDateKey(new Date());
      const todayCount = productionLogs.filter(pl => manilaDateKey(pl.dt) === todayKey).length;

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

      {/* STOCKS VIEW: KPI -> SUBTABS -> TABLE */}
      {mainTab === 'stocks' && (
        <div className="space-y-6 ">
          
          {/* 2. DYNAMIC KPI CARDS (Nasa taas) */}
          {kpiData && (
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
import { useState } from 'react';
import RawTab from '../components/inventory/RawTab';
import CelebrationTab from '../components/inventory/CelebrationTab';
import RecipeTab from '../components/inventory/RecipeTab';
import ProductionTab from '../components/inventory/ProductionTab';
import WasteTab from '../components/inventory/WasteTab';
import ProductLogTab from '../components/inventory/ProductLogTab';

// ── MAIN TABS ──
const MAIN_TABS = [
  { key: 'stocks',     label: 'Stocks' },
  { key: 'production', label: 'Production' },
  { key: 'waste',      label: 'Waste Log' },
];

// ── SUB TABS PER GROUP (hanggang 3 lang para kasya sa phone, walang swipe) ──
// `short` ang ipinapakita sa mobile, `label` ang buo para sa mas malaking screen
const SUBTABS = {
  stocks: [
    { key: 'raw',    label: 'Ingredients',                     short: 'Ingredients' },
    { key: 'celeb',  label: 'Celebration / Product Materials', short: 'Materials' },
  ],
  production: [
    { key: 'recipe',   label: 'Production Formula', short: 'Formula' },
    { key: 'preorder', label: 'Production',         short: 'Production' },
    { key: 'product',  label: 'Production Log',     short: 'Log' },
  ],
};

const DEFAULT_SUB = { stocks: 'raw', production: 'preorder' };

const isValidSub = (group, key) => SUBTABS[group]?.some(t => t.key === key);

// Ang dating localStorage ('inv_main_tab' / 'inv_sub_tab') ay compatible pa rin:
// kung production-type ang huling sub-tab, doon didiretso ang user.
const loadInitialState = () => {
  const oldMain = localStorage.getItem('inv_main_tab');
  const oldSub  = localStorage.getItem('inv_sub_tab');

  const subs = { ...DEFAULT_SUB };
  if (isValidSub('stocks', oldSub))     subs.stocks = oldSub;
  if (isValidSub('production', oldSub)) subs.production = oldSub;

  let main = 'stocks';
  if (oldMain === 'waste') main = 'waste';
  else if (oldMain === 'production') main = 'production';
  else if (oldMain === 'stocks' && isValidSub('production', oldSub)) main = 'production';

  return { main, subs };
};

export default function InventoryPage() {
  const [state, setState] = useState(loadInitialState);
  const { main: mainTab, subs } = state;

  const handleMainTabChange = (key) => {
    setState(prev => ({ ...prev, main: key }));
    localStorage.setItem('inv_main_tab', key);
  };

  const handleSubTabChange = (group, key) => {
    setState(prev => ({ ...prev, subs: { ...prev.subs, [group]: key } }));
    localStorage.setItem('inv_sub_tab', key);
  };

  const subTabs   = SUBTABS[mainTab];
  const activeSub = subs[mainTab];

  return (
    <div className="space-y-4 sm:space-y-6 min-w-0">
      {/* 1. MAIN TABS (Stocks | Production | Waste Log) — full width sa mobile */}
      <div className="grid grid-cols-3 sm:flex gap-1 bg-brand-100 rounded-xl p-1 w-full sm:w-fit border border-brand-200">
        {MAIN_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => handleMainTabChange(tab.key)}
            className={`px-2 sm:px-6 py-2.5 rounded-lg text-[13px] sm:text-sm font-bold transition-all whitespace-nowrap text-center outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${
              mainTab === tab.key
                ? 'bg-white text-brand-900 shadow-sm'
                : 'text-brand-500 hover:text-brand-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 2. SUB TABS — pantay-pantay ang lapad sa mobile, walang swipe */}
      {subTabs && (
        <div className="space-y-4 sm:space-y-6 min-w-0">
          <div role="tablist" className="flex sm:gap-6 border-b-2 border-brand-100 sm:px-2">
            {subTabs.map(tab => (
              <button
                key={tab.key}
                role="tab"
                aria-selected={activeSub === tab.key}
                onClick={() => handleSubTabChange(mainTab, tab.key)}
                className={`flex-1 sm:flex-none px-1 sm:px-0 pb-3 text-[13px] sm:text-sm font-bold text-center border-b-2 transition-all -mb-0.5 outline-none focus-visible:ring-2 focus-visible:ring-brand-300 rounded-t-md ${
                  activeSub === tab.key
                    ? 'border-brand-800 text-brand-900'
                    : 'border-transparent text-brand-400 hover:text-brand-600'
                }`}
              >
                <span className="sm:hidden">{tab.short}</span>
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* 3. CONTENT */}
          <div className="pt-1 sm:pt-2 min-w-0">
            {mainTab === 'stocks' && activeSub === 'raw'   && <RawTab />}
            {mainTab === 'stocks' && activeSub === 'celeb' && <CelebrationTab />}
            {mainTab === 'production' && activeSub === 'recipe'   && <RecipeTab />}
            {mainTab === 'production' && activeSub === 'preorder' && <ProductionTab />}
            {mainTab === 'production' && activeSub === 'product'  && <ProductLogTab />}
          </div>
        </div>
      )}

      {/* WASTE LOG VIEW */}
      {mainTab === 'waste' && <WasteTab />}
    </div>
  );
}
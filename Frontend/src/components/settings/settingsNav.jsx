import { ChevronDown } from 'lucide-react';

// ─── Sections shown in Settings ────────────────────────────────
export const SETTINGS_TABS = [
  { id: 'security', label: 'Security' }
];

export default function SettingsNav({ active, onChange }) {
  return (
    <>
      {/* Mobile: dropdown selector */}
      <div className="md:hidden relative">
        <select
          value={active}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none rounded-xl border border-brand-200 bg-white pl-3.5 pr-9 py-2.5 text-[13.5px] font-semibold text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-300"
        >
          {SETTINGS_TABS.map((tab) => (
            <option key={tab.id} value={tab.id}>{tab.label}</option>
          ))}
        </select>
        <ChevronDown size={15} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-brand-400" />
      </div>

      {/* Desktop: plain vertical link list, GitHub-settings style */}
      <nav className="hidden md:flex md:flex-col shrink-0">
        {SETTINGS_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={
              `text-left px-3.5 py-2 rounded-md text-[13.5px] border-l-2 transition-colors ` +
              (active === tab.id
                ? 'border-brand-700 bg-brand-50 text-brand-800 font-semibold'
                : 'border-transparent text-brand-500 hover:bg-brand-50 hover:text-brand-700 font-medium')
            }
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </>
  );
}
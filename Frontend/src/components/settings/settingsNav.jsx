import { ChevronDown, Lock } from 'lucide-react';

// ─── Sections shown in Settings ────────────────────────────────
export const SETTINGS_TABS = [
  { id: 'security', label: 'Security', icon: Lock }
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

      {/* Desktop: pill-style vertical nav, consistent with the app's main sidebar */}
      <nav className="hidden md:flex md:flex-col gap-1 shrink-0">
        {SETTINGS_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={
              `flex items-center gap-2.5 text-left px-3.5 py-2.5 rounded-lg text-[13.5px] transition-colors ` +
              (active === tab.id
                ? 'bg-brand-700 text-white font-semibold shadow-sm'
                : 'text-brand-500 hover:bg-white hover:text-brand-800 font-medium')
            }
          >
            <tab.icon size={15} strokeWidth={2.2} className="shrink-0" />
            {tab.label}
          </button>
        ))}
      </nav>
    </>
  );
}
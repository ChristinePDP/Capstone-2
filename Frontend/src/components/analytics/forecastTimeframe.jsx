import { useState, useRef, useEffect } from 'react';
import { Filter, Check } from 'lucide-react';

const RANGES = [
  { key: '7d', label: '7 Days', days: 7 },
  { key: '30d', label: '30 Days', days: 30 },
];

export default function ForecastTimeframe({
  defaultValue = '30d',
  onChange,
}) {
  const [selected, setSelected] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (key) => {
    setSelected(key);
    setOpen(false);
    if (onChange) onChange(key);
  };

  const activeLabel = RANGES.find((r) => r.key === selected)?.label || '30 Days';

  return (
    // `w-fit` para hindi ma-stretch ng parent flex/grid ang wrapper
    <div className="relative inline-block w-fit max-w-full" ref={wrapperRef}>
      {/* Parehong style ng Performance timeframe trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 px-3 py-2 text-[13px] font-bold border border-brand-300 rounded-lg shadow-sm bg-white text-brand-600 hover:bg-brand-50 hover:text-brand-800 transition-colors whitespace-nowrap"
      >
        <Filter size={15} className="shrink-0" />
        <span className="truncate max-w-[160px]">Forecast: {activeLabel}</span>
      </button>

      {open && (
        // Parehong style ng Performance dropdown: plain white menu, may check sa napili
        <div className="absolute z-10 top-full left-0 mt-2 bg-white border border-brand-300 rounded-xl shadow-lg overflow-hidden max-w-[95vw]">
          <ul role="menu" className="py-2 w-[200px]">
            {RANGES.map((opt) => (
              <li key={opt.key} role="presentation">
                <button
                  type="button"
                  role="menuitem"
                  data-testid={`forecast-btn-${opt.key}`}
                  onClick={() => handleSelect(opt.key)}
                  className="w-full flex items-center justify-between px-4 py-2 text-[12px] sm:text-[13px] font-bold bg-white text-brand-700 hover:bg-brand-50 hover:text-brand-900 transition-colors whitespace-nowrap"
                >
                  <span>{opt.label}</span>
                  {selected === opt.key && <Check size={14} className="text-brand-600" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
export { RANGES };
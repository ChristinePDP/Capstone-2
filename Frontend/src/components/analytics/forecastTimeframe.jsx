import { useState, useRef, useEffect } from 'react';
import { Filter, ChevronDown } from 'lucide-react';

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
    <div className="relative inline-block" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-[#e7ded4] bg-white text-[13px] font-bold text-[#5C3317] shadow-sm hover:bg-[#f9f6f1] transition-colors"
      >
        <Filter size={14} className="text-[#9a8b7a] shrink-0" />
        <span className="whitespace-nowrap">Forecast: {activeLabel}</span>
        <ChevronDown
          size={14}
          className={`text-[#9a8b7a] shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute right-0 mt-1.5 w-40 bg-white border border-[#e7ded4] rounded-lg shadow-lg overflow-hidden z-20">
          {RANGES.map((opt) => (
            <button
              key={opt.key}
              type="button"
              data-testid={`forecast-btn-${opt.key}`}
              onClick={() => handleSelect(opt.key)}
              aria-pressed={selected === opt.key}
              className={`w-full text-left px-3.5 py-2.5 text-[13px] font-semibold transition-colors ${
                selected === opt.key
                  ? 'bg-[#5C3317] text-white'
                  : 'text-[#5C3317] hover:bg-[#f9f6f1]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
export { RANGES };
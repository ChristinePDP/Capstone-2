import { useState } from 'react';

const RANGES = [
  { key: '7d', label: 'Next 7 Days', days: 7 },
  { key: '30d', label: 'Next 30 Days', days: 30 },
  { key: '60d', label: 'Next 60 Days', days: 60 },
];

export default function ForecastTimeframe({
  defaultValue = '30d',
  onChange,
}) {
  const [selected, setSelected] = useState(defaultValue);

  const handleSelect = (key) => {
    setSelected(key);
    if (onChange) onChange(key);
  };

  return (
    <div className="max-w-full overflow-x-auto rounded-lg border border-[#e7ded4] shadow-sm">
      <div className="inline-flex w-max min-w-full sm:min-w-0">
        {RANGES.map((opt) => (
          <button
            key={opt.key}
            type="button"
            data-testid={`forecast-btn-${opt.key}`}
            onClick={() => handleSelect(opt.key)}
            aria-pressed={selected === opt.key}
            className={`flex-1 sm:flex-none px-3 py-1.5 text-[12px] font-bold border-r border-[#e7ded4] last:border-r-0 transition-colors whitespace-nowrap ${
              selected === opt.key
                ? 'bg-[#5C3317] text-white'
                : 'bg-white text-[#5C3317] hover:bg-[#f9f6f1]'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
export { RANGES };
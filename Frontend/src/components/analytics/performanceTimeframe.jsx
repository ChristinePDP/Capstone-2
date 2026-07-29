import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Calendar, Check, ChevronRight } from 'lucide-react';

const SECTIONS = [
  { label: 'Single day', options: ['Today', 'Yesterday'] },
  { label: 'Rolling', options: ['Last 7 Days'] },
  { label: 'Calendar', options: ['This Month', 'Last Month', 'This Year'] },
];

const ALL_OPTIONS = SECTIONS.flatMap(s => s.options);

export default function PerformanceTimeframe({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const containerRef = useRef(null);

  const isCustomSelected = value && !ALL_OPTIONS.includes(value) && value !== 'Custom Range...';
  const displayLabel = isCustomSelected ? value : (value || ALL_OPTIONS[0]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setShowCustom(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (v) => {
    if (v === 'Custom Range...') {
      setShowCustom(true);
      return;
    }
    onChange(v);
    setOpen(false);
    setShowCustom(false);
  };

  const applyCustomRange = () => {
    if (!customStart || !customEnd) return;
    onChange(`${customStart} - ${customEnd}`);
    setOpen(false);
    setShowCustom(false);
  };

  return (
    <div className="flex items-center gap-4">
      <div className="relative" ref={containerRef}>
        {/* Trigger Button */}
        <button
          data-testid="performance-dropdown-trigger"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => {
            setOpen((o) => !o);
            setShowCustom(false);
          }}
          className="flex items-center justify-between gap-2 min-w-[160px] px-4 py-2 text-[13px] font-bold border border-brand-300 rounded-lg shadow-sm bg-white text-brand-600 hover:bg-brand-50 hover:text-brand-800 transition-colors whitespace-nowrap"
        >
          <span className="truncate">{displayLabel}</span>
          <ChevronDown
            size={14}
            className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>

        {open && (
          <div className="absolute z-10 top-full right-0 mt-2 w-full min-w-[200px] bg-white border border-brand-300 rounded-lg shadow-sm overflow-hidden">
            {!showCustom ? (
              <div role="menu" className="py-2">
                {SECTIONS.map((section, index) => (
                  <div key={section.label}>
                    {/* Divider for subsequent sections */}
                    {index > 0 && <div className="h-px bg-brand-100 my-1 mx-3" />}
                    
                    {/* Micro-label */}
                    <div className="px-4 py-1 text-[10px] font-bold uppercase tracking-wider text-brand-400">
                      {section.label}
                    </div>
                    
                    {/* Options */}
                    <ul>
                      {section.options.map((v) => (
                        <li key={v} role="presentation">
                          <button
                            role="menuitem"
                            data-testid={`option-${v.replace(/\s+/g, '-').toLowerCase()}`}
                            onClick={() => handleSelect(v)}
                            className="w-full flex items-center justify-between px-4 py-2 text-[13px] font-bold bg-white text-brand-600 hover:bg-brand-50 hover:text-brand-800 transition-colors whitespace-nowrap"
                          >
                            <span>{v}</span>
                            {value === v && <Check size={14} className="text-brand-600" />}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                
                {/* Custom Range Section */}
                <div className="h-px bg-brand-100 my-1 mx-3" />
                <button
                  role="menuitem"
                  onClick={() => handleSelect('Custom Range...')}
                  className="w-full flex items-center justify-between px-4 py-2 text-[13px] font-bold bg-white text-brand-600 hover:bg-brand-50 hover:text-brand-800 transition-colors"
                >
                  <span>Custom Range</span>
                  <ChevronRight size={14} className="text-brand-400" />
                </button>
              </div>
            ) : (
              <div className="p-4 flex flex-col gap-3">
                <div className="flex items-center gap-2 text-brand-700">
                  <Calendar size={14} />
                  <span className="text-[13px] font-bold">Custom Range</span>
                </div>

                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold text-brand-600">Start date</span>
                  <input
                    type="date"
                    data-testid="custom-start-date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="px-3 py-2 text-[13px] border border-brand-300 rounded-md text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-700"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold text-brand-600">End date</span>
                  <input
                    type="date"
                    data-testid="custom-end-date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="px-3 py-2 text-[13px] border border-brand-300 rounded-md text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-700"
                  />
                </label>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    data-testid="back-custom-range"
                    onClick={() => setShowCustom(false)}
                    className="px-3 py-1.5 text-[13px] font-bold text-brand-600 hover:text-brand-800 transition-colors"
                  >
                    Back
                  </button>
                  <button
                    data-testid="apply-custom-range"
                    onClick={applyCustomRange}
                    disabled={!customStart || !customEnd}
                    className="px-3 py-1.5 text-[13px] font-bold rounded-md bg-brand-700 text-white hover:bg-brand-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
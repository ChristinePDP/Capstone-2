import { useState, useRef, useEffect, useMemo } from 'react';
import { Filter, Check, ChevronLeft, ChevronRight } from 'lucide-react';

const PRESETS = ['Today', 'Yesterday', 'Past 7 Days', 'Past 30 Days'];

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_LABELS = ['S','M','T','W','T','F','S'];

const fmtShort = (d) => `${MONTH_NAMES[d.getMonth()].slice(0, 3)} ${d.getDate()}, ${d.getFullYear()}`;
const sameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

function buildMonthGrid(year, month) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Array(firstDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  return cells;
}

export default function PerformanceTimeframe({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [rangeStart, setRangeStart] = useState(null);
  const [rangeEnd, setRangeEnd] = useState(null);
  const [viewDate, setViewDate] = useState(() => new Date());
  const containerRef = useRef(null);

  const isCustomSelected = value && !PRESETS.includes(value);
  const currentLabel = isCustomSelected ? value : (value || PRESETS[0]);
  const hasActiveFilter = currentLabel !== PRESETS[0];

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

  const handleSelectPreset = (v) => {
    onChange(v);
    setOpen(false);
    setShowCustom(false);
  };

  const openCustom = () => {
    setRangeStart(null);
    setRangeEnd(null);
    setViewDate(new Date());
    setShowCustom(true);
  };

  const handleDayClick = (date) => {
    if (!rangeStart || (rangeStart && rangeEnd)) {
      setRangeStart(date);
      setRangeEnd(null);
    } else if (date < rangeStart) {
      setRangeEnd(rangeStart);
      setRangeStart(date);
    } else {
      setRangeEnd(date);
    }
  };

  const applyCustomRange = () => {
    if (!rangeStart || !rangeEnd) return;
    onChange(`${fmtShort(rangeStart)} - ${fmtShort(rangeEnd)}`);
    setOpen(false);
    setShowCustom(false);
  };

  const leftMonth = viewDate;
  const rightMonth = useMemo(() => new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1), [viewDate]);

  const renderMonth = (monthDate, showPrevNav, showNextNav) => {
    const cells = buildMonthGrid(monthDate.getFullYear(), monthDate.getMonth());
    return (
      <div className="flex-1">
        <div className="flex items-center justify-between mb-2">
          {showPrevNav ? (
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
              className="p-1 rounded hover:bg-brand-50 text-brand-500 transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
          ) : <span className="w-6" />}
          <span className="text-[11px] sm:text-[12px] font-bold text-brand-800">
            {MONTH_NAMES[monthDate.getMonth()]} {monthDate.getFullYear()}
          </span>
          {showNextNav ? (
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
              className="p-1 rounded hover:bg-brand-50 text-brand-500 transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          ) : <span className="w-6" />}
        </div>
        <div className="grid grid-cols-7 gap-y-1 text-[9px] sm:text-[10px] font-semibold text-brand-400 text-center mb-1">
          {DAY_LABELS.map((d, i) => <span key={i}>{d}</span>)}
        </div>
        <div className="grid grid-cols-7 gap-y-1 gap-x-0.5 text-[11px] sm:text-[12px] text-center">
          {cells.map((date, i) => {
            if (!date) return <span key={i} />;
            const day = startOfDay(date);
            const isStart = sameDay(day, rangeStart);
            const isEnd = sameDay(day, rangeEnd);
            const inRange = rangeStart && rangeEnd && day > rangeStart && day < rangeEnd;
            let cls = 'py-1 rounded cursor-pointer hover:bg-brand-50 transition-colors';
            if (isStart || isEnd) cls = 'py-1 rounded cursor-pointer bg-brand-700 text-white font-bold shadow-sm';
            else if (inRange) cls = 'py-1 rounded cursor-pointer bg-brand-100 text-brand-800 font-medium';
            return (
              <button type="button" key={i} onClick={() => handleDayClick(day)} className={cls}>
                {date.getDate()}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="flex items-center gap-4 max-w-full">
      <div className="relative" ref={containerRef}>
        <button
          data-testid="performance-dropdown-trigger"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => { setOpen((o) => !o); setShowCustom(false); }}
          className="relative flex items-center gap-2 px-3 py-2 text-[13px] font-bold border border-brand-300 rounded-lg shadow-sm bg-white text-brand-600 hover:bg-brand-50 hover:text-brand-800 transition-colors whitespace-nowrap"
        >
          <Filter size={15} className="shrink-0" />
          <span className="truncate max-w-[140px]">{currentLabel}</span>
          {hasActiveFilter && (
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-brand-700" aria-hidden="true" />
          )}
        </button>

        {open && (
          // FIX: dati, naka `right-0` lang ito (naka-anchor sa kanang gilid
          // ng trigger button, bumubukas papuntang kaliwa). Sa mobile,
          // malapit sa KALIWANG gilid ng screen ang trigger, kaya kapag
          // "right-0" ang anchor ng 200px-wide na menu, halos lumalabas ito
          // sa negative x-offset — off-canvas sa kaliwa ng screen — kaya
          // invisible ang mga text (checkmark/icon na lang minsan ang
          // natitirang bahagi na naka-buffer pa sa loob ng viewport).
          // Sa `sm:` pataas (mas malawak na screen), bumabalik sa dating
          // `right-0` na anchoring.
          <div className="absolute z-10 top-full left-0 sm:left-auto sm:right-0 mt-2 bg-white border border-brand-300 rounded-xl shadow-lg overflow-hidden max-w-[95vw] sm:max-w-none">
            {!showCustom ? (
              <div role="menu" className="py-2 w-[200px]">
                <ul>
                  {PRESETS.map((v) => (
                    <li key={v} role="presentation">
                      <button
                        role="menuitem"
                        data-testid={`option-${v.replace(/\s+/g, '-').toLowerCase()}`}
                        onClick={() => handleSelectPreset(v)}
                        className="w-full flex items-center justify-between px-4 py-2 text-[12px] sm:text-[13px] font-bold bg-white text-brand-700 hover:bg-brand-50 hover:text-brand-900 transition-colors whitespace-nowrap"
                      >
                        <span>{v}</span>
                        {value === v && <Check size={14} className="text-brand-600" />}
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="h-px bg-brand-100 my-1 mx-3" />
                <button
                  role="menuitem"
                  data-testid="option-custom-range"
                  onClick={openCustom}
                  className={`w-full flex items-center justify-between px-4 py-2 text-[12px] sm:text-[13px] font-bold transition-colors whitespace-nowrap ${isCustomSelected ? 'bg-brand-50 text-brand-900' : 'bg-white text-brand-700 hover:bg-brand-50 hover:text-brand-900'}`}
                >
                  <span>Custom Range</span>
                  {isCustomSelected && <Check size={14} className="text-brand-600" />}
                </button>
              </div>
            ) : (
              // Lalo pang pinaliit: 260px (mobile) at 440px (desktop)
              <div className="p-3 sm:p-4 flex flex-col gap-3 w-[260px] sm:w-[440px]">
                <div className="flex flex-col sm:flex-row items-center gap-2">
                  <input
                    readOnly
                    value={rangeStart ? fmtShort(rangeStart) : 'Start date'}
                    className="w-full sm:flex-1 text-center px-2 py-1.5 text-[11px] sm:text-[12px] font-medium border border-brand-300 rounded text-brand-800 bg-brand-50/50"
                  />
                  <span className="text-brand-400 text-[11px] sm:text-[12px] font-semibold hidden sm:inline-block">to</span>
                  <input
                    readOnly
                    value={rangeEnd ? fmtShort(rangeEnd) : 'End date'}
                    className="w-full sm:flex-1 text-center px-2 py-1.5 text-[11px] sm:text-[12px] font-medium border border-brand-300 rounded text-brand-800 bg-brand-50/50"
                  />
                </div>

                <div className="flex flex-col sm:flex-row gap-4 py-1">
                  {renderMonth(leftMonth, true, false)}
                  <div className="h-px w-full bg-brand-100 sm:hidden" />
                  {renderMonth(rightMonth, false, true)}
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-brand-100">
                  <button
                    data-testid="back-custom-range"
                    onClick={() => setShowCustom(false)}
                    className="px-3 py-1.5 text-[11px] sm:text-[12px] font-bold text-brand-600 hover:text-brand-800 hover:bg-brand-50 rounded transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    data-testid="apply-custom-range"
                    onClick={applyCustomRange}
                    disabled={!rangeStart || !rangeEnd}
                    className="px-3 py-1.5 text-[11px] sm:text-[12px] font-bold rounded bg-brand-700 text-white hover:bg-brand-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
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
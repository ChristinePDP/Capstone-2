import { useState, useRef, useEffect, useLayoutEffect, useSyncExternalStore } from 'react';
import { Filter, Check, ChevronLeft, ChevronRight } from 'lucide-react';

const PRESETS = ['Today', 'Yesterday', 'Past 7 Days', 'Past 30 Days'];

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// Same label format as before ("Dec 1, 2025 - Nov 30, 2026") so the API
// calls and the StackedBar `period` keep working exactly the same.
const fmtShort = (d) => `${MONTH_NAMES[d.getMonth()].slice(0, 3)} ${d.getDate()}, ${d.getFullYear()}`;

// Reverse of fmtShort — used to pre-fill the picker with the currently
// applied custom range when the person re-opens Custom Range.
const parseShort = (s) => {
  const m = s.trim().match(/^([A-Za-z]{3}) (\d{1,2}), (\d{4})$/);
  if (!m) return null;
  const monthIdx = MONTH_NAMES.findIndex((n) => n.slice(0, 3) === m[1]);
  if (monthIdx < 0) return null;
  return new Date(Number(m[3]), monthIdx, Number(m[2]));
};

const parseCustomLabel = (label) => {
  if (typeof label !== 'string') return null;
  const parts = label.split(' - ');
  if (parts.length !== 2) return null;
  const start = parseShort(parts[0]);
  const end = parseShort(parts[1]);
  return start && end ? { start, end } : null;
};

const toLocalDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

function SimpleCustomRange({ value, onApply, onCancel }) {
  const today = new Date();
  const defaultStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29);
  const [start, setStart] = useState(value?.start ? toLocalDateKey(value.start) : toLocalDateKey(defaultStart));
  const [end, setEnd] = useState(value?.end ? toLocalDateKey(value.end) : toLocalDateKey(today));
  const invalid = !start || !end || end < start;

  const apply = () => {
    if (invalid) return;
    const [sy, sm, sd] = start.split('-').map(Number);
    const [ey, em, ed] = end.split('-').map(Number);
    onApply?.({ start: new Date(sy, sm - 1, sd), end: new Date(ey, em - 1, ed) });
  };

  return (
    <div role="dialog" aria-label="Select date range" className="w-[min(20rem,calc(100vw-2rem))] p-4">
      <h3 className="text-sm font-bold text-brand-800 mb-1">Custom date range</h3>
      <p className="text-xs text-brand-500 mb-4">Choose the first and last day to include.</p>
      <div className="grid grid-cols-1 gap-3">
        <label className="text-xs font-semibold text-brand-600">
          Start date
          <input aria-label="Start date" type="date" value={start} onChange={(e) => setStart(e.target.value)} className="mt-1 block w-full h-10 rounded-lg border border-brand-200 bg-brand-50 px-3 text-sm text-brand-800 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-200" />
        </label>
        <label className="text-xs font-semibold text-brand-600">
          End date
          <input aria-label="End date" type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="mt-1 block w-full h-10 rounded-lg border border-brand-200 bg-brand-50 px-3 text-sm text-brand-800 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-200" />
        </label>
      </div>
      {end < start && <p role="alert" className="mt-2 text-xs text-red-500">End date must be on or after start date.</p>}
      <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-brand-100">
        <button type="button" onClick={onCancel} className="h-9 px-4 rounded-lg text-sm font-semibold text-brand-600 hover:bg-brand-50">Cancel</button>
        <button type="button" onClick={apply} disabled={invalid} className="h-9 px-5 rounded-lg text-sm font-semibold text-white bg-brand-600 hover:bg-brand-800 disabled:bg-brand-300 disabled:cursor-not-allowed">Apply</button>
      </div>
    </div>
  );
}

// =====================================================================
// DateRangePicker
// =====================================================================
/**
 * DateRangePicker
 * - Type dates with a MM/DD/YYYY mask OR pick them from the calendar (both stay in sync).
 * - Calendar opens on the selected / current month, with month + year dropdowns for fast jumps.
 * - Validates invalid dates (e.g. 02/30/2026), out-of-range dates and end < start.
 * - Responsive: 2 months on wide screens, 1 month on phones. Full keyboard support.
 *
 * Props:
 *   value     { start, end }  Date or 'YYYY-MM-DD' (optional, initial range)
 *   onApply   ({ start, end, startISO, endISO }) => void
 *   onCancel  () => void
 *   minDate / maxDate   optional limits (Date or 'YYYY-MM-DD')
 *   className extra classes for the panel
 *   bare      true = no border/shadow/background (use inside a popover that already has them)
 */

// ---------- date helpers ----------

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const pad2 = (n) => String(n).padStart(2, '0');
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const sameDay = (a, b) => !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const toKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const fromKey = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const formatDate = (d) => (d ? `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}/${d.getFullYear()}` : '');
const monthStart = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const addMonths = (first, n) => new Date(first.getFullYear(), first.getMonth() + n, 1);
const monthIndex = (d) => d.getFullYear() * 12 + d.getMonth();
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const shiftMonth = (d, n) => {
  const first = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return new Date(first.getFullYear(), first.getMonth(), Math.min(d.getDate(), daysInMonth));
};

const toDate = (v) => {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v) ? null : startOfDay(v);
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return fromKey(v.slice(0, 10));
  const d = new Date(v);
  return isNaN(d) ? null : startOfDay(d);
};

// "11/12/2026" -> Date, or null if incomplete / not a real calendar date.
const parseMasked = (text) => {
  if (text.length !== 10) return null;
  const [mm, dd, yyyy] = text.split('/').map(Number);
  if (!mm || !dd || yyyy < 1900 || yyyy > 2100) return null;
  const d = new Date(yyyy, mm - 1, dd);
  if (d.getFullYear() !== yyyy || d.getMonth() !== mm - 1 || d.getDate() !== dd) return null;
  return d;
};

// digits -> "MM/DD/YYYY" (slashes only appear once the next part has started)
const maskDigits = (digits) =>
  [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean).join('/');

const buildMonthCells = (first) => {
  const y = first.getFullYear();
  const m = first.getMonth();
  const cells = [];
  for (let i = 0; i < first.getDay(); i += 1) cells.push(null);
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(new Date(y, m, d));
  return cells;
};

const NARROW_QUERY = '(max-width: 639px)';
const subscribeNarrow = (onChange) => {
  const mq = window.matchMedia(NARROW_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
};
const getNarrow = () => window.matchMedia(NARROW_QUERY).matches;
const getNarrowOnServer = () => false;

// useSyncExternalStore = the React-recommended way to read matchMedia
// (walang setState sa loob ng effect, at walang flicker sa unang render).
function useIsNarrow() {
  return useSyncExternalStore(subscribeNarrow, getNarrow, getNarrowOnServer);
}

// ---------- component ----------

export function DateRangePicker({
  value,
  onApply,
  onCancel,
  minDate: minDateProp,
  maxDate: maxDateProp,
  className = '',
  bare = false,
}) {
  const isNarrow = useIsNarrow();
  const monthCount = isNarrow ? 1 : 2;

  const today = startOfDay(new Date());
  const minDate = toDate(minDateProp);
  const maxDate = toDate(maxDateProp);

  const initStart = toDate(value?.start);
  const initEnd = toDate(value?.end);

  const [startText, setStartText] = useState(formatDate(initStart));
  const [endText, setEndText] = useState(formatDate(initEnd));
  const [viewMonth, setViewMonth] = useState(() => monthStart(initStart || today));
  const [hoverDate, setHoverDate] = useState(null);
  const [focusKey, setFocusKey] = useState(null);

  const startRef = useRef(null);
  const endRef = useRef(null);
  const gridRef = useRef(null);
  const pendingCaret = useRef(null);
  const pendingFocus = useRef(false);

  const startDate = parseMasked(startText);
  const endDate = parseMasked(endText);

  const inBounds = (d) => (!minDate || d >= minDate) && (!maxDate || d <= maxDate);
  const isVisibleDate = (d) => {
    const i = monthIndex(d);
    const first = monthIndex(viewMonth);
    return i >= first && i <= first + monthCount - 1;
  };

  // ----- validation -----
  const startError =
    startText.length === 10 && !startDate
      ? 'Enter a valid date'
      : startDate && !inBounds(startDate)
        ? 'Date is out of range'
        : '';
  const endError =
    endText.length === 10 && !endDate
      ? 'Enter a valid date'
      : endDate && !inBounds(endDate)
        ? 'Date is out of range'
        : startDate && endDate && endDate < startDate
          ? 'End date must be on or after the start date'
          : '';
  const canApply = !!startDate && !!endDate && !startError && !endError;
  const nextField = !startDate || endDate ? 'start' : 'end';

  // ----- keep the calendar on the typed month (called from the typing handler, not from an effect) -----
  const ensureVisible = (date, which) => {
    setViewMonth((prev) => {
      const idx = monthIndex(date);
      const first = monthIndex(prev);
      if (idx >= first && idx <= first + monthCount - 1) return prev;
      return which === 'end' && monthCount === 2 ? addMonths(monthStart(date), -1) : monthStart(date);
    });
  };

  // Restore the caret after the mask rewrites the text (so mid-text edits feel natural).
  useLayoutEffect(() => {
    const p = pendingCaret.current;
    if (!p) return;
    pendingCaret.current = null;
    const el = p.which === 'start' ? startRef.current : endRef.current;
    if (el && document.activeElement === el) el.setSelectionRange(p.pos, p.pos);
  });

  // Move DOM focus to the day chosen with the keyboard once it is rendered.
  useEffect(() => {
    if (!pendingFocus.current) return;
    pendingFocus.current = false;
    gridRef.current?.querySelector(`[data-date="${focusKey}"]`)?.focus();
  });

  // ----- masked typing -----
  const handleMaskedChange = (which, e) => {
    const el = e.target;
    const raw = el.value;
    const prev = which === 'start' ? startText : endText;
    const caret = el.selectionStart ?? raw.length;
    const grew = raw.length > prev.length;
    const atEnd = caret === raw.length;

    let digits = raw.replace(/\D/g, '');
    let digitsBefore = raw.slice(0, caret).replace(/\D/g, '').length;

    if (!grew && digits === prev.replace(/\D/g, '') && digitsBefore > 0) {
      // A "/" was deleted: remove the digit before it as well, so backspace never gets stuck.
      digits = digits.slice(0, digitsBefore - 1) + digits.slice(digitsBefore);
      digitsBefore -= 1;
    } else if (grew && atEnd && /[/\-.\s]$/.test(raw)) {
      // Typed a separator after a single digit: "1/" -> "01/"
      const parts = prev.split('/');
      const last = parts[parts.length - 1];
      if (parts.length < 3 && last.length === 1) {
        digits = `${digits.slice(0, -1)}0${last}`;
        digitsBefore += 1;
      }
    } else if (grew && atEnd) {
      // First digit can't start a valid month/day: "5" -> "05", "12/4" -> "12/04"
      if (digits.length === 1 && digits > '1') {
        digits = `0${digits}`;
        digitsBefore = 2;
      } else if (digits.length === 3 && digits[2] > '3') {
        digits = `${digits.slice(0, 2)}0${digits[2]}`;
        digitsBefore = 4;
      }
    }

    if (grew) {
      // Reject keystrokes that can never form a valid month or day.
      if (digits.length >= 2) {
        const mm = Number(digits.slice(0, 2));
        if (mm < 1 || mm > 12) return;
      }
      if (digits.length >= 4) {
        const dd = Number(digits.slice(2, 4));
        if (dd < 1 || dd > 31) return;
      }
    }

    digits = digits.slice(0, 8);
    digitsBefore = Math.min(digitsBefore, digits.length);
    const formatted = maskDigits(digits);
    const pos = digitsBefore <= 2 ? digitsBefore : digitsBefore <= 4 ? digitsBefore + 1 : digitsBefore + 2;
    pendingCaret.current = { which, pos: Math.min(pos, formatted.length) };

    const typed = parseMasked(formatted);
    if (typed) ensureVisible(typed, which);

    if (which === 'start') setStartText(formatted);
    else setEndText(formatted);
  };

  const handleInputKeyDown = (e) => {
    if (e.key === 'Enter' && canApply) {
      e.preventDefault();
      apply();
    }
  };

  // ----- calendar selection -----
  const pickDay = (d) => {
    setFocusKey(toKey(d));
    if (startDate && endDate) {
      setStartText(formatDate(d));
      setEndText('');
    } else if (!startDate || d < startDate) {
      setStartText(formatDate(d));
    } else {
      setEndText(formatDate(d));
    }
  };

  const handleGridKeyDown = (e) => {
    const el = e.target.closest?.('[data-date]');
    if (!el) return;
    const cur = fromKey(el.dataset.date);
    let next;
    switch (e.key) {
      case 'ArrowLeft': next = addDays(cur, -1); break;
      case 'ArrowRight': next = addDays(cur, 1); break;
      case 'ArrowUp': next = addDays(cur, -7); break;
      case 'ArrowDown': next = addDays(cur, 7); break;
      case 'Home': next = addDays(cur, -cur.getDay()); break;
      case 'End': next = addDays(cur, 6 - cur.getDay()); break;
      case 'PageUp': next = shiftMonth(cur, -1); break;
      case 'PageDown': next = shiftMonth(cur, 1); break;
      default: return;
    }
    e.preventDefault();
    if (!inBounds(next)) return;
    if (!isVisibleDate(next)) {
      setViewMonth(
        monthIndex(next) < monthIndex(viewMonth)
          ? monthStart(next)
          : addMonths(monthStart(next), -(monthCount - 1))
      );
    }
    setFocusKey(toKey(next));
    pendingFocus.current = true;
  };

  const apply = () => {
    if (!canApply) return;
    onApply?.({ start: startDate, end: endDate, startISO: toKey(startDate), endISO: toKey(endDate) });
  };

  const handlePanelKeyDown = (e) => {
    if (e.key === 'Escape') onCancel?.();
  };

  // ----- calendar rendering -----
  // Which day can be reached with Tab (roving tabindex: one stop for the whole grid).
  let tabbableKey = null;
  for (const c of [focusKey ? fromKey(focusKey) : null, startDate, today]) {
    if (c && isVisibleDate(c) && inBounds(c)) {
      tabbableKey = toKey(c);
      break;
    }
  }
  if (!tabbableKey) {
    for (let i = 0; i < 31; i += 1) {
      const c = addDays(viewMonth, i);
      if (inBounds(c)) {
        tabbableKey = toKey(c);
        break;
      }
    }
  }

  const previewEnd = endDate || (startDate && hoverDate && hoverDate >= startDate ? hoverDate : null);

  const viewYear = viewMonth.getFullYear();
  const yearFrom = Math.min(minDate ? minDate.getFullYear() : today.getFullYear() - 10, viewYear);
  const yearTo = Math.max(maxDate ? maxDate.getFullYear() : today.getFullYear() + 2, viewYear);
  const years = [];
  for (let y = yearFrom; y <= yearTo; y += 1) years.push(y);

  const prevDisabled = !!minDate && new Date(viewYear, viewMonth.getMonth(), 0) < minDate;
  const nextDisabled = !!maxDate && addMonths(viewMonth, monthCount) > maxDate;

  const navBtn =
    'w-8 h-8 shrink-0 flex items-center justify-center rounded-full text-brand-500 hover:bg-brand-100 hover:text-brand-800 transition-colors disabled:opacity-30 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600';
  const selectCls =
    'appearance-none bg-transparent font-bold text-sm text-brand-800 cursor-pointer rounded-md px-1.5 py-1 text-center hover:bg-brand-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600';

  const renderMonth = (offset) => {
    const first = addMonths(viewMonth, offset);
    const cells = buildMonthCells(first);
    const isFirst = offset === 0;
    const isLast = offset === monthCount - 1;

    return (
      <div key={toKey(first)} className="flex-1 min-w-0">
        <div className="flex items-center justify-between h-9 mb-2">
          {isFirst ? (
            <button type="button" className={navBtn} onClick={() => setViewMonth(addMonths(viewMonth, -1))} disabled={prevDisabled} aria-label="Previous month">
              <ChevronLeft size={16} />
            </button>
          ) : (
            <span className="w-8" />
          )}

          {isFirst ? (
            <div className="flex items-center gap-1">
              <select
                className={selectCls}
                value={viewMonth.getMonth()}
                onChange={(e) => setViewMonth(new Date(viewYear, Number(e.target.value), 1))}
                aria-label="Month"
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={i}>{m}</option>
                ))}
              </select>
              <select
                className={selectCls}
                value={viewYear}
                onChange={(e) => setViewMonth(new Date(Number(e.target.value), viewMonth.getMonth(), 1))}
                aria-label="Year"
              >
                {years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          ) : (
            <span className="text-sm font-bold text-brand-800">
              {MONTHS[first.getMonth()]} {first.getFullYear()}
            </span>
          )}

          {isLast ? (
            <button type="button" className={navBtn} onClick={() => setViewMonth(addMonths(viewMonth, 1))} disabled={nextDisabled} aria-label="Next month">
              <ChevronRight size={16} />
            </button>
          ) : (
            <span className="w-8" />
          )}
        </div>

        <div className="grid grid-cols-7 mb-1">
          {WEEKDAYS.map((w, i) => (
            <span key={i} className="h-8 flex items-center justify-center text-xs font-bold text-brand-400" aria-hidden="true">
              {w}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {cells.map((d, i) => {
            if (!d) return <span key={`blank-${i}`} className="h-9" />;
            const key = toKey(d);
            const isStart = sameDay(d, startDate);
            const isEnd = sameDay(d, endDate);
            const selected = isStart || isEnd;
            const hasSpan = !!startDate && !!previewEnd && !sameDay(startDate, previewEnd);
            const inRange = hasSpan && d > startDate && d < previewEnd;
            const bandStart = hasSpan && isStart;
            const bandEnd = hasSpan && sameDay(d, previewEnd);
            const isToday = sameDay(d, today);
            const disabled = !inBounds(d);

            let stateCls = 'text-brand-800 hover:bg-brand-100';
            if (selected) stateCls = 'bg-brand-600 text-white font-semibold hover:bg-brand-600';
            else if (bandEnd) stateCls = 'bg-brand-200 text-brand-800 font-semibold';
            else if (isToday) stateCls += ' ring-1 ring-brand-400';
            if (disabled) stateCls = 'text-brand-300 opacity-50 cursor-not-allowed';

            return (
              <div key={key} className="relative h-9 flex items-center justify-center">
                {inRange && <span aria-hidden="true" className="absolute inset-y-0.5 inset-x-0 bg-brand-100" />}
                {bandStart && <span aria-hidden="true" className="absolute inset-y-0.5 right-0 w-1/2 bg-brand-100" />}
                {bandEnd && !isStart && <span aria-hidden="true" className="absolute inset-y-0.5 left-0 w-1/2 bg-brand-100" />}
                <button
                  type="button"
                  data-date={key}
                  disabled={disabled}
                  tabIndex={key === tabbableKey ? 0 : -1}
                  onClick={() => pickDay(d)}
                  onMouseEnter={() => setHoverDate(d)}
                  onFocus={() => setFocusKey(key)}
                  aria-label={d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                  aria-pressed={selected}
                  aria-current={isToday ? 'date' : undefined}
                  className={`relative z-10 w-8 h-8 rounded-full text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-1 ${stateCls}`}
                >
                  {d.getDate()}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const inputCls = (hasError, isNext) =>
    `w-full h-10 px-3 text-center text-sm font-medium text-brand-800 bg-brand-50 border rounded-lg outline-none transition-colors placeholder:text-brand-300 focus:border-brand-600 focus:ring-2 focus:ring-brand-200 ${
      hasError ? 'border-red-400' : isNext ? 'border-brand-400' : 'border-brand-200'
    }`;

  return (
    <div
      role="dialog"
      aria-label="Select date range"
      onKeyDown={handlePanelKeyDown}
      className={`${bare ? 'p-3 sm:p-4' : 'bg-white rounded-2xl border border-brand-200 shadow-xl p-4 sm:p-5'} w-75 max-w-[calc(100vw-2rem)] sm:max-w-none sm:w-145 ${className}`}
    >
      {/* Typed input (masked) */}
      <div className="flex items-start gap-2 sm:gap-3 mb-4">
        <div className="flex-1 min-w-0">
          <input
            ref={startRef}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength={10}
            placeholder="MM/DD/YYYY"
            aria-label="Start date"
            aria-invalid={!!startError}
            value={startText}
            onChange={(e) => handleMaskedChange('start', e)}
            onKeyDown={handleInputKeyDown}
            className={inputCls(!!startError, nextField === 'start')}
          />
          {startError && <p role="alert" className="mt-1 text-xs text-red-500">{startError}</p>}
        </div>

        <span className="h-10 flex items-center text-xs font-bold text-brand-400">to</span>

        <div className="flex-1 min-w-0">
          <input
            ref={endRef}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength={10}
            placeholder="MM/DD/YYYY"
            aria-label="End date"
            aria-invalid={!!endError}
            value={endText}
            onChange={(e) => handleMaskedChange('end', e)}
            onKeyDown={handleInputKeyDown}
            className={inputCls(!!endError, nextField === 'end')}
          />
          {endError && <p role="alert" className="mt-1 text-xs text-red-500">{endError}</p>}
        </div>
      </div>

      {/* Calendar(s) */}
      <div
        ref={gridRef}
        onKeyDown={handleGridKeyDown}
        onMouseLeave={() => setHoverDate(null)}
        className="flex gap-6"
      >
        {Array.from({ length: monthCount }, (_, i) => renderMonth(i))}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t border-brand-100">
        <button
          type="button"
          data-testid="back-custom-range"
          onClick={() => onCancel?.()}
          className="h-9 px-4 rounded-lg text-sm font-semibold text-brand-600 hover:bg-brand-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
        >
          Cancel
        </button>
        <button
          type="button"
          data-testid="apply-custom-range"
          onClick={apply}
          disabled={!canApply}
          className="h-9 px-5 rounded-lg text-sm font-semibold text-white bg-brand-600 hover:bg-brand-800 transition-colors disabled:bg-brand-300 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
        >
          Apply
        </button>
      </div>
    </div>
  );
}


// =====================================================================
// PerformanceTimeframe
// =====================================================================
export default function PerformanceTimeframe({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
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
    setShowCustom(true);
  };

  const handleApplyCustom = ({ start, end }) => {
    onChange(`${fmtShort(start)} - ${fmtShort(end)}`);
    setOpen(false);
    setShowCustom(false);
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
          <span className="truncate max-w-35">{currentLabel}</span>
          {hasActiveFilter && (
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-brand-700" aria-hidden="true" />
          )}
        </button>

        {open && (
          // Sa mobile naka-anchor sa kaliwa (para hindi lumabas sa screen),
          // sa `sm:` pataas naka-anchor sa kanan ng trigger.
          <div className="absolute z-10 top-full left-0 sm:left-auto sm:right-0 mt-2 bg-white border border-brand-300 rounded-xl shadow-lg overflow-hidden max-w-[95vw] sm:max-w-none">
            {!showCustom ? (
              <div role="menu" className="py-2 w-50">
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
              // `bare` = walang sariling border/shadow, kasi nasa loob na ng popover na may border at shadow.
              <SimpleCustomRange
                value={isCustomSelected ? parseCustomLabel(value) : null}
                onApply={handleApplyCustom}
                onCancel={() => setShowCustom(false)}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

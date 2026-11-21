import { useState, useEffect, useRef } from 'react';
import { ChevronDown, Trash2, Plus, Pencil } from 'lucide-react';
import { Button, Table, Tr, Td, Modal, ConfirmModal, useUnsavedChanges, Skeleton, ProductGridSkeleton, EmptyState, ErrorState } from '../ui';

// Base URL ng backend. Kinukuha mula sa VITE_API_URL sa .env
// (hal. VITE_API_URL=http://localhost:3000/api — kasama na ang "/api"
// dito, kaya "/products" na lang ang idinadagdag natin sa ibaba,
// hindi na "/api/products" para hindi maging "/api/api/products").
const API_BASE = `${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/online-ordering/products`;

// FIX: dating fetchEvents() lang ang laman ng useEffect ng component — kaya
// tuwing lilipat ka papunta sa "Product Management" o "Promo Bundles" tab
// (nag-uunmount ang EventManager) at babalik ka rito, bagong fetch ulit sa
// backend. Inilipat sa MODULE SCOPE ang cache (sa labas ng component) kaya
// minsan lang talaga ito magre-request habang bukas ang session.
let eventsCache = null;
let eventsCachePromise = null;

async function fetchEventsFromApi(force = false) {
  if (eventsCache && !force) return eventsCache;
  if (eventsCachePromise && !force) return eventsCachePromise;

  eventsCachePromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/events`);
      const data = await parseResponse(res);
      eventsCache = data || [];
      return eventsCache;
    } finally {
      eventsCachePromise = null;
    }
  })();

  return eventsCachePromise;
}

const MONTHS = [
  { val: 1, label: 'January' }, { val: 2, label: 'February' }, 
  { val: 3, label: 'March' }, { val: 4, label: 'April' },
  { val: 5, label: 'May' }, { val: 6, label: 'June' },
  { val: 7, label: 'July' }, { val: 8, label: 'August' },
  { val: 9, label: 'September' }, { val: 10, label: 'October' },
  { val: 11, label: 'November' }, { val: 12, label: 'December' }
];

const getDaysInMonth = (month) => {
  if ([4, 6, 9, 11].includes(Number(month))) return 30;
  if (Number(month) === 2) return 29; 
  return 31;
};

const eventDayIndex = (month, day) => {
  const date = new Date(Date.UTC(2000, Number(month) - 1, Number(day)));
  return Math.floor((date.getTime() - Date.UTC(2000, 0, 1)) / 86400000);
};
const eventIsLiveOnDay = (event, dayIndex) => {
  const start = eventDayIndex(event.start_month, event.start_day);
  const end = eventDayIndex(event.end_month, event.end_day);
  return start <= end ? dayIndex >= start && dayIndex <= end : dayIndex >= start || dayIndex <= end;
};
const formatEventDay = dayIndex => {
  const date = new Date(Date.UTC(2000, 0, 1 + dayIndex));
  return `${MONTHS[date.getUTCMonth()].label.slice(0, 3)} ${date.getUTCDate()}`;
};
const getEventLiveLimitConflict = (candidate, events = [], excludeId = null) => {
  if (candidate.is_active === false) return null;
  const others = events.filter(event => event.is_active !== false && String(event.id) !== String(excludeId));
  const start = eventDayIndex(candidate.start_month, candidate.start_day);
  const end = eventDayIndex(candidate.end_month, candidate.end_day);
  const rangeLength = (end - start + 366) % 366 + 1;
  let conflictStart = -1;
  let conflictEnd = -1;
  const liveNames = new Set();

  for (let offset = 0; offset < rangeLength; offset += 1) {
    const day = (start + offset) % 366;
    const liveEvents = others.filter(event => eventIsLiveOnDay(event, day));
    if (liveEvents.length >= 3) {
      if (conflictStart < 0) conflictStart = offset;
      conflictEnd = offset;
      liveEvents.forEach(event => liveNames.add(event.event_name));
    } else if (conflictStart >= 0) {
      break;
    }
  }

  if (conflictStart < 0) return null;
  const firstDay = (start + conflictStart) % 366;
  const lastDay = (start + conflictEnd) % 366;
  return `Only 3 events can run at the same time. From ${formatEventDay(firstDay)} to ${formatEventDay(lastDay)}, these are already live: ${[...liveNames].join(', ')}. Change the dates or set one of them to inactive.`;
};

// Text field na may inline validation: pulang border + pulang label, at ang
// error message ay nasa mismong field (overlay sa ilalim nito, hindi
// nagdadagdag ng taas kaya hindi gumagalaw ang form). Kapag may `hint`,
// itinatago (invisible, pero nananatili ang espasyo) ang hint habang may
// error para hindi magpatong ang dalawang text.
function FormInput({ label, required, error, hint, className = '', ...props }) {
  const errorCls = 'absolute left-1 text-[10px] leading-3 text-red-500 whitespace-nowrap pointer-events-none';
  return (
    <div className="w-full min-w-0">
      {label && (
        <label className={`text-[11px] font-bold uppercase tracking-wider mb-1.5 block ${error ? 'text-red-500' : 'text-brand-500'}`}>
          {label} {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      {/* Ang error ay laging nakakabit sa mismong input (hindi sa dulo ng buong field) */}
      <div className="relative">
        <input
          aria-invalid={!!error}
          data-invalid={error ? 'true' : undefined}
          className={`w-full border rounded-xl px-3.5 py-2.5 text-xs outline-none bg-white transition-colors ${error ? 'border-red-500 focus:border-red-500' : 'border-[#DED4CC] focus:border-[#5A453C]'} ${className}`}
          {...props}
        />
        {!hint && error && <span role="alert" className={`${errorCls} top-full mt-0.5`}>{error}</span>}
      </div>
      {/* May hint: ang error ay pumapalit sa hint sa MISMONG puwesto nito (direkta sa ilalim ng input),
          at nananatili ang taas ng hint kaya hindi gumagalaw ang layout. */}
      {hint && (
        <div className="relative mt-1.5">
          <p className={`text-[10px] text-[#8A7264] leading-snug ${error ? 'invisible' : ''}`}>{hint}</p>
          {error && <span role="alert" className={`${errorCls} top-0`}>{error}</span>}
        </div>
      )}
    </div>
  );
}

function CustomDropdown({ value, options, onChange, openUpwards = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedLabel = options.find(o => o.value === value)?.label || value;
  const positionClasses = openUpwards ? 'bottom-full mb-1' : 'top-full mt-1';

  return (
    <div className="relative w-full min-w-0" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full min-w-0 gap-1.5 border border-[#DED4CC] rounded-xl px-3 sm:px-3.5 py-2.5 text-xs outline-none bg-white flex justify-between items-center text-[#3B1F0A] hover:border-[#5A453C] transition-colors"
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronDown size={14} className={`shrink-0 text-[#8A7264] transition-transform ${isOpen && openUpwards ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <ul className={`absolute z-50 w-full bg-white border border-[#DED4CC] rounded-xl shadow-lg max-h-40 overflow-y-auto py-1 scrollbar-thin ${positionClasses}`}>
          {options.map((opt) => (
            <li
              key={opt.value}
              onClick={() => {
                onChange(opt.value);
                setIsOpen(false);
              }}
              className={`px-3.5 py-2 text-xs cursor-pointer hover:bg-[#F5EFEB] transition-colors ${
                value === opt.value ? 'bg-[#F5EFEB] font-bold text-[#3B1F0A]' : 'text-[#5A453C]'
              }`}
            >
              {opt.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EventModal({ 
  isOpen = true, 
  onClose, 
  isEditing = false,
  initialData, 
  onSave,
  serverError = null,
  events = [],
  onValidationError = () => {}
}) {
  const [form, setForm] = useState(() => initialData || {
    event_name: '',
    event_tag: '',
    start_month: 1,
    start_day: 1,
    end_month: 1,
    end_day: 1,
    is_active: true
  });

  // Inline validation: ang error ng required field ay lumalabas mismo sa field.
  const [errors, setErrors] = useState({});

  const computeErrors = (f) => {
    const next = {};
    if (!String(f.event_name || '').trim()) next.event_name = 'Event name is required.';
    if (!String(f.event_tag || '').trim()) next.event_tag = 'Event tag is required.';
    return next;
  };

  // Mawawala agad ang error ng field na naayos na habang nagta-type.
  useEffect(() => {
    setErrors(prev => {
      const keys = Object.keys(prev);
      if (keys.length === 0) return prev;
      const latest = computeErrors(form);
      const next = {};
      keys.forEach(k => { if (latest[k]) next[k] = latest[k]; });
      return Object.keys(next).length === keys.length ? prev : next;
    });
  }, [form]);

  const handleSave = () => {
    const found = computeErrors(form);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      setTimeout(() => {
        document.querySelector('[data-invalid="true"]')
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
      return;
    }
    const conflict = getEventLiveLimitConflict(form, events, initialData?.id);
    if (conflict) {
      onValidationError(conflict);
      return;
    }
    onSave({
      ...form,
      ...(isEditing && initialData?.id ? { id: initialData.id } : {}),
      event_name: form.event_name.trim(),
      event_tag: form.event_tag.trim(),
    });
  };

  // Compare only editable event fields in a fixed order and normalized types.
  // Database-only fields such as id must not make an untouched form look dirty.
  // FIX: dating `(data = {})` lang — gumagana lang ang default na iyon kapag
  // `undefined`. Pero `null` ang initialData kapag "Add New Event" (selectedEvent
  // = null), kaya nag-crash ang `data.event_name`. Ngayon, `data || {}` para
  // sakop pati null.
  const normalizeEventForm = (data) => {
    const d = data || {};
    return {
      event_name: d.event_name ?? '',
      event_tag: d.event_tag ?? '',
      start_month: Number(d.start_month ?? 1),
      start_day: Number(d.start_day ?? 1),
      end_month: Number(d.end_month ?? 1),
      end_day: Number(d.end_day ?? 1),
      is_active: d.is_active ?? true,
    };
  };

  const closeGuard = useUnsavedChanges({
    isOpen,
    values: normalizeEventForm(form),
    initialValues: normalizeEventForm(initialData),
    onClose,
    onSave: handleSave,
  });

  // FIX: dating nasa itaas ito (bago ang useUnsavedChanges). Kapag isOpen=false,
  // nagre-return agad bago tumakbo ang useUnsavedChanges, kaya pag naging
  // isOpen=true ay mas marami ang hooks na tumakbo kaysa sa previous render
  // ("Rendered more hooks than during the previous render"). Dapat nasa
  // ibaba ng LAHAT ng hooks ang conditional return.
  if (!isOpen) return null;

  const monthOptions = MONTHS.map(m => ({ value: m.val, label: m.label }));
  
  const startMaxDays = getDaysInMonth(form.start_month);
  const startDayOptions = Array.from({ length: startMaxDays }, (_, i) => ({ value: i + 1, label: (i + 1).toString() }));

  const endMaxDays = getDaysInMonth(form.end_month);
  const endDayOptions = Array.from({ length: endMaxDays }, (_, i) => ({ value: i + 1, label: (i + 1).toString() }));

  // Ginayahan na ang modal sa mismong shared Modal/Input/Button mula sa ../ui
  // (kaparehong components na ginagamit ng ibang bahagi ng app) sa halip na
  // sariling custom overlay/card/button markup — kaya consistent na ang
  // radius, spacing, header/footer style, at portal behavior (dati'y hindi
  // naka-portal ang modal na ito, kaya iba ang stacking behavior nito kumpara
  // sa ibang modals gaya ng ConfirmModal).
  return (
    <>
    <Modal
      isOpen={isOpen}
      onClose={closeGuard.requestClose}
      title={isEditing ? 'Edit Event' : 'Add New Event'}
      size="sm"
      footer={
        <div className="flex items-center justify-end gap-2 sm:gap-3">
          <Button variant="secondary" onClick={closeGuard.requestClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSave}>
            {isEditing ? 'Save Changes' : 'Save Event'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">

        {/* Server/save error — nasa loob ng modal mismo (hindi sa page sa likod ng overlay) */}
        {serverError && (
          <div role="alert" className="px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-xs text-red-600 font-medium">
            {serverError}
          </div>
        )}

        <FormInput
          label="Event Name"
          required
          error={errors.event_name}
          value={form.event_name}
          onChange={(e) => setForm({ ...form, event_name: e.target.value })}
          placeholder="e.g. Valentine's Promo"
        />

        <FormInput
          label="Event Tag"
          required
          error={errors.event_tag}
          value={form.event_tag}
          onChange={(e) => setForm({ ...form, event_tag: e.target.value })}
          placeholder="e.g. valentines"
          hint="Products tagged with this will automatically appear in the online ordering popup while this event is live."
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          <div className="w-full min-w-0">
            <label className="text-[11px] font-bold uppercase tracking-wider text-brand-500 mb-1.5 block">
              Start Date (Annual) <span className="text-red-500 ml-0.5">*</span>
            </label>
            <div className="flex gap-2">
              <div className="flex-1 min-w-0">
                <CustomDropdown 
                  value={form.start_month}
                  options={monthOptions}
                  openUpwards={true}
                  onChange={(newMonth) => {
                    const maxDays = getDaysInMonth(newMonth);
                    setForm({
                      ...form, 
                      start_month: newMonth,
                      start_day: form.start_day > maxDays ? maxDays : form.start_day 
                    });
                  }}
                />
              </div>
              <div className="w-18 shrink-0">
                <CustomDropdown 
                  value={form.start_day}
                  options={startDayOptions}
                  openUpwards={true}
                  onChange={(newDay) => setForm({...form, start_day: newDay})}
                />
              </div>
            </div>
          </div>

          <div className="w-full min-w-0">
            <label className="text-[11px] font-bold uppercase tracking-wider text-brand-500 mb-1.5 block">
              End Date (Annual) <span className="text-red-500 ml-0.5">*</span>
            </label>
            <div className="flex gap-2">
              <div className="flex-1 min-w-0">
                <CustomDropdown 
                  value={form.end_month}
                  options={monthOptions}
                  openUpwards={true}
                  onChange={(newMonth) => {
                    const maxDays = getDaysInMonth(newMonth);
                    setForm({
                      ...form, 
                      end_month: newMonth,
                      end_day: form.end_day > maxDays ? maxDays : form.end_day 
                    });
                  }}
                />
              </div>
              <div className="w-18 shrink-0">
                <CustomDropdown 
                  value={form.end_day}
                  options={endDayOptions}
                  openUpwards={true}
                  onChange={(newDay) => setForm({...form, end_day: newDay})}
                />
              </div>
            </div>
          </div>

        </div>

        <div className="flex items-center gap-2 mt-1">
          <input 
            type="checkbox" 
            id="activeToggle" 
            checked={form.is_active} 
            onChange={(e) => setForm({...form, is_active: e.target.checked})} 
            className="w-4 h-4 accent-brand-600 rounded cursor-pointer border-brand-200" 
          />
          <label 
            htmlFor="activeToggle" 
            className="text-xs font-bold uppercase tracking-wider text-brand-800 select-none cursor-pointer"
          >
            Set as Active
          </label>
        </div>
        <p className="text-[10px] text-[#8A7264] leading-snug -mt-2">
          When on, the event goes live automatically during its date range every year. When off, it never runs.
        </p>

      </div>
    </Modal>
    {closeGuard.confirmation}
    </>
  );
}

// ============================================================
// PARENT COMPONENT: EventManager
// Dito na-connect sa backend (/events endpoints) yung
// Add / Edit / Delete na galing sa EventModal. Walang mock/seed
// data — talagang mula sa database ang lahat ng makikita dito.
// ============================================================

const formatDate = (month, day) => {
  const label = MONTHS.find(m => m.val === Number(month))?.label.slice(0, 3);
  return `${label} ${day}`;
};

// ─────────────────────────────────────────────────────────────
// EVENT STATUS — ang "Active" ay ibig sabihin lang na naka-ON ang event
// (is_active). Hindi nito sinasabi kung tumatakbo ba ito NGAYON. Kaya ang
// ipinapakita ay ang totoong estado ayon sa petsa ngayon:
//   • Live now   — naka-ON at nasa loob ng date range ngayon
//   • Scheduled  — naka-ON pero hindi pa/hindi na ang petsa (babalik taon-taon)
//   • Inactive   — naka-OFF, hindi tatakbo kahit pumatak ang petsa
// Ang mga event ay umuulit kada taon (buwan/araw lang ang tinatago), kaya
// walang "Ended": pagkatapos ng end date, "Scheduled" ulit para sa susunod na taon.
// ─────────────────────────────────────────────────────────────
const MS_PER_DAY = 86400000;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / MS_PER_DAY);
const pluralDays = (n) => `${n} day${n === 1 ? '' : 's'}`;

function getEventStatus(event, now = new Date()) {
  if (!event.is_active) {
    return { key: 'inactive', label: 'Inactive', detail: 'Turned off', sortKey: 1e9 };
  }

  const today = startOfDay(now);
  const sm = Number(event.start_month), sd = Number(event.start_day);
  const em = Number(event.end_month), ed = Number(event.end_day);
  const wraps = em < sm || (em === sm && ed < sd); // hal. Dec 20 – Jan 5

  let nextStart = null;
  for (let year = today.getFullYear() - 1; year <= today.getFullYear() + 1; year += 1) {
    const start = new Date(year, sm - 1, sd);
    const end = new Date(wraps ? year + 1 : year, em - 1, ed);

    if (today >= start && today <= end) {
      const left = daysBetween(today, end);
      return {
        key: 'live',
        label: 'Live now',
        detail: left === 0 ? 'Last day today' : `Ends ${formatDate(em, ed)} · ${pluralDays(left)} left`,
        sortKey: -1,
      };
    }
    if (start > today && (!nextStart || start < nextStart)) nextStart = start;
  }

  const until = daysBetween(today, nextStart);
  return {
    key: 'scheduled',
    label: 'Scheduled',
    detail: until === 1 ? 'Starts tomorrow' : `Starts in ${pluralDays(until)}`,
    sortKey: until,
  };
}

const STATUS_STYLES = {
  live:      { pill: 'bg-green-100 text-green-700',  dot: 'bg-green-500 animate-pulse' },
  scheduled: { pill: 'bg-amber-50 text-amber-700 border border-amber-200', dot: 'bg-amber-500' },
  inactive:  { pill: 'bg-[#F1EBE6] text-[#8A7264]',  dot: 'bg-[#B7A99F]' },
};

function StatusPill({ status }) {
  const style = STATUS_STYLES[status.key];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold leading-5 whitespace-nowrap ${style.pill}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
      {status.label}
    </span>
  );
}

// Para sa table (desktop): pill + detail, magkatapat.
function EventStatus({ event }) {
  const status = getEventStatus(event);
  return (
    <div className="flex flex-col gap-1 min-w-0 items-start">
      <StatusPill status={status} />
      <span className="text-[11px] text-[#8A7264] leading-tight whitespace-nowrap">{status.detail}</span>
    </div>
  );
}

// Helper para consistent yung pag-handle ng response mula sa backend
// (success/message/data shape, tulad ng ginagamit sa product endpoints)
const parseResponse = async (res) => {
  const result = await res.json().catch(() => ({}));
  if (!res.ok || result.success === false) {
    throw new Error(result.message || result.error || 'Something went wrong. Please try again.');
  }
  return result.data;
};

export default function EventManager() {
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null); // error ng Add/Edit — ipinapakita sa loob ng modal

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);

  // State para sa delete confirmation modal
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Kunin lahat ng events mula sa backend
  const fetchEvents = async (force = false, silent = false) => {
    if (!silent && (force || events.length === 0)) setIsLoading(true);
    setError(null);
    try {
      const data = await fetchEventsFromApi(force);
      setEvents(data);
    } catch (err) {
      console.error('Fetch Events Error:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents(true);
  }, []);

  // Keep events fresh across separate admin sessions even if a database
  // Realtime notification is missed while this page remains open.
  useEffect(() => {
    let active = true;
    let inFlight = false;
    const refreshEvents = async () => {
      if (!active || inFlight || document.visibilityState === 'hidden') return;
      inFlight = true;
      try {
        const latest = await fetchEventsFromApi(true);
        if (active) setEvents(latest || []);
      } catch (err) {
        console.warn('Background event refresh failed:', err);
      } finally {
        inFlight = false;
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshEvents();
    };
    const timer = window.setInterval(refreshEvents, 5000);
    window.addEventListener('focus', refreshEvents);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshEvents);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    const handleDataChanged = async (event) => {
      const change = event.detail || {};
      if (change.table !== 'occasions') return;
      const id = change.record?.id || change.recordId;
      if (!id) return fetchEvents(true, true);
      if (change.event === 'DELETE') {
        setEvents(previous => previous.filter(item => String(item.id) !== String(id)));
        if (eventsCache) eventsCache = eventsCache.filter(item => String(item.id) !== String(id));
        return;
      }
      try {
        const response = await fetch(`${API_BASE}/events/${encodeURIComponent(id)}`);
        const updated = await parseResponse(response);
        setEvents(previous => previous.some(item => String(item.id) === String(id))
          ? previous.map(item => String(item.id) === String(id) ? updated : item)
          : [...previous, updated]);
        if (eventsCache) {
          eventsCache = eventsCache.some(item => String(item.id) === String(id))
            ? eventsCache.map(item => String(item.id) === String(id) ? updated : item)
            : [...eventsCache, updated];
        }
      } catch (err) {
        console.error('Refresh Event Error:', err);
      }
    };
    window.addEventListener('cake:data-changed', handleDataChanged);
    return () => {
      window.removeEventListener('cake:data-changed', handleDataChanged);
    };
  }, []);

  const handleOpenAdd = () => {
    setSelectedEvent(null);
    setIsEditing(false);
    setSaveError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (event) => {
    setSelectedEvent(event);
    setIsEditing(true);
    setSaveError(null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    if (isSaving) return; // huwag payagan mag-close habang nagse-save
    setIsModalOpen(false);
    setSelectedEvent(null);
    setSaveError(null);
  };

  // Add / Edit — POST kung bagong event, PUT kung mayroon nang id
  const handleSave = async (formData) => {
    setIsSaving(true);
    setSaveError(null);
    try {
      const isUpdate = isEditing && formData.id;
      const operationLabel = isUpdate ? 'update_event' : 'create_event';
      const res = await fetch(`${API_BASE}/events${isUpdate ? `/${formData.id}` : ''}?devtools_label=${operationLabel}`, {
        method: isUpdate ? 'PUT' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      await parseResponse(res);
      await fetchEvents(true); // force: kailangan bagong datos, hindi stale cache
      handleCloseModal();
    } catch (err) {
      console.error('Save Event Error:', err);
      setSaveError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Binubuksan yung confirm toast — hindi pa dine-delete agad
  const requestDelete = (event) => {
    setDeleteTarget(event);
  };

  const cancelDelete = () => {
    if (isDeleting) return; // huwag payagan mag-cancel habang nagde-delete
    setDeleteTarget(null);
  };

  // Actual delete — tatakbo lang kapag na-confirm sa toast
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/events/${deleteTarget.id}?devtools_label=delete_event`, { method: 'DELETE', credentials: 'include' });
      await parseResponse(res);
      setEvents(prev => prev.filter(ev => ev.id !== deleteTarget.id));
      if (eventsCache) eventsCache = eventsCache.filter(ev => ev.id !== deleteTarget.id);
      setDeleteTarget(null);
    } catch (err) {
      console.error('Delete Event Error:', err);
      setError(err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  // Live muna, tapos ang pinakamalapit na susunod, at Inactive sa dulo.
  const sortedEvents = [...events].sort((a, b) => (
    getEventStatus(a).sortKey - getEventStatus(b).sortKey
    || String(a.event_name).localeCompare(String(b.event_name))
  ));

  return (
    <div>
      {/* Palaging ipakita ang scrollbar ng page (kahit maikli lang ang laman
          gaya ngayon dahil kaunti pa lang ang events) para hindi
          "gumagalaw"/lumiliit ang layout tuwing nagpapalit ng dami ng laman
          ang page. */}
      <style>{`html { overflow-y: scroll; }`}</style>

      <div className="flex items-center justify-between mb-5 sm:mb-6 flex-wrap gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#3B1F0A]">Event Manager</h1>
          <p className="text-xs sm:text-sm text-[#8A7264] mt-1">Manage seasonal events and the products tagged to them</p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="bg-[#3B1F0A] text-white hover:bg-[#2A1608] px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-colors shadow-md flex items-center justify-center gap-1.5 w-full sm:w-auto shrink-0"
        >
          <Plus size={16} /> Add New Event
        </button>
      </div>

      {error && events.length > 0 && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-xs text-red-600 font-medium">
          {error}
        </div>
      )}

      {isLoading ? (
        <>
          <div className="hidden lg:block overflow-hidden rounded-2xl border border-[#EAE4E0] bg-white shadow-sm" role="status" aria-label="Loading events" aria-live="polite">
            <div className="grid grid-cols-5 gap-4 bg-brand-600 px-4 py-3"><Skeleton className="bg-white/30" w="w-16" h="h-3" /><Skeleton className="bg-white/30" w="w-20" h="h-3" /><Skeleton className="bg-white/30" w="w-20" h="h-3" /><Skeleton className="bg-white/30" w="w-14" h="h-3" /><Skeleton className="bg-white/30 ml-auto" w="w-14" h="h-3" /></div>
            {Array.from({ length: 5 }).map((_, row) => <div key={row} className="grid grid-cols-5 items-center gap-4 border-t border-brand-100 px-4 py-5"><Skeleton w="w-32" /><Skeleton w="w-24" /><Skeleton w="w-24" /><Skeleton w="w-16" /><Skeleton className="ml-auto" w="w-20" /></div>)}
          </div>
          <ProductGridSkeleton count={4} columns="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" className="lg:hidden" />
        </>
      ) : events.length === 0 ? (
        error
          ? <ErrorState description={error} onRetry={() => fetchEvents(true)} />
          : <EmptyState title="No events yet" description="Create an event to make it available to your customers." actionLabel="Add New Event" onAction={handleOpenAdd} />
      ) : (
        <>
          {/* TABLE — makikita mula md breakpoint pataas (tablet/desktop).
              Gamit na ang mismong Table/Tr/Td/Badge/Button mula sa shared ../ui
              (kaparehong components na ginagamit ng Orders) para eksaktong
              magkatugma ang header bar, badge, at action buttons — hindi na
              hex-approximation lang. */}
          <div className="hidden lg:block bg-white rounded-2xl border border-[#EAE4E0] overflow-x-auto shadow-sm">
            <Table columns={[
              { label: 'Event' }, { label: 'Event Tag' }, { label: 'Date Range' },
              { label: 'Status' }, { label: 'Action', align: 'right' },
            ]}>
              {sortedEvents.map((event) => (
                <Tr key={event.id}>
                  <Td className="font-semibold text-brand-900">{event.event_name}</Td>
                  <Td>{event.event_tag}</Td>
                  <Td className="whitespace-nowrap">
                    {formatDate(event.start_month, event.start_day)} – {formatDate(event.end_month, event.end_day)}
                  </Td>
                  <Td>
                    <EventStatus event={event} />
                  </Td>
                  <Td align="right">
                    <div className="flex items-center justify-end gap-2">
                      <Button size="sm" variant="secondary" className="text-xs px-3 py-1.5" onClick={() => handleOpenEdit(event)}>
                        <Pencil size={12} /> Edit
                      </Button>
                      <Button size="sm" variant="danger" className="text-xs px-3 py-1.5" onClick={() => requestDelete(event)}>
                        <Trash2 size={12} /> Delete
                      </Button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </Table>
          </div>

          {/* CARDS — makikita lang pagbaba sa mobile (below md breakpoint).
              Kaparehong pill badge at bordered text+icon action buttons ng
              desktop table para consistent ang dalawang view. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:hidden gap-3 sm:gap-4">
            {sortedEvents.map((event) => {
              const status = getEventStatus(event);
              return (
                <div
                  key={event.id}
                  className="bg-white rounded-2xl border border-[#EAE4E0] shadow-sm p-4 sm:p-5 flex flex-col gap-4 min-w-0"
                >
                  {/* Header: pangalan + status detail sa kaliwa, pill sa kanan */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm sm:text-base font-bold text-[#3B1F0A] leading-snug wrap-break-word">
                        {event.event_name}
                      </h3>
                      <p className="mt-0.5 text-[11px] text-[#8A7264] leading-snug">{status.detail}</p>
                    </div>
                    <StatusPill status={status} />
                  </div>

                  {/* Details: dalawang pantay na column, label sa ibabaw ng value */}
                  <dl className="grid grid-cols-2 gap-3 rounded-xl bg-[#FCFAF9] border border-[#EAE4E0] p-3">
                    <div className="min-w-0">
                      <dt className="text-[10px] font-bold text-[#8A7264] uppercase tracking-wider mb-1">Event Tag</dt>
                      <dd className="text-xs font-semibold text-[#3B1F0A] wrap-break-word">{event.event_tag}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-[10px] font-bold text-[#8A7264] uppercase tracking-wider mb-1">Date Range</dt>
                      <dd className="text-xs font-semibold text-[#3B1F0A]">
                        {formatDate(event.start_month, event.start_day)} – {formatDate(event.end_month, event.end_day)}
                      </dd>
                    </div>
                  </dl>

                  {/* Actions: dalawang pantay na button, buong lapad */}
                  <div className="grid grid-cols-2 gap-2 mt-auto">
                    <Button size="sm" variant="secondary" className="w-full py-2" onClick={() => handleOpenEdit(event)}>
                      <Pencil size={13} /> Edit
                    </Button>
                    <Button size="sm" variant="danger" className="w-full py-2" onClick={() => requestDelete(event)}>
                      <Trash2 size={13} /> Delete
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <EventModal
        key={`${isModalOpen ? 'open' : 'closed'}:${selectedEvent?.id ?? 'new'}`}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        isEditing={isEditing}
        initialData={selectedEvent}
        onSave={handleSave}
        serverError={saveError}
        events={events}
        onValidationError={setSaveError}
      />

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={cancelDelete}
        onConfirm={confirmDelete}
        title="Delete Event"
        message={`Are you sure you want to delete "${deleteTarget?.event_name ?? ''}"? This cannot be undone.`}
        confirmLabel="Delete"
      />
    </div>
  );
}

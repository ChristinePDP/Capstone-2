import { useState, useEffect, useRef } from 'react';
import { ChevronDown, Trash2, Plus, Pencil, Loader2 } from 'lucide-react';
import { Badge, Button, Table, Tr, Td, Modal, Input } from '../ui';

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
    <div className="relative w-full" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full border border-[#DED4CC] rounded-xl px-3.5 py-2.5 text-xs outline-none bg-white flex justify-between items-center text-[#3B1F0A] hover:border-[#5A453C] transition-colors"
      >
        <span>{selectedLabel}</span>
        <ChevronDown size={14} className={`text-[#8A7264] transition-transform ${isOpen && openUpwards ? 'rotate-180' : ''}`} />
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

// Locks background page scroll while a modal is open. Without this, scrolling
// inside the modal (or over the backdrop) also scrolls the page behind it —
// the overlay alone doesn't stop that. Restores the exact scroll position on
// close so the page doesn't jump.
function useLockBodyScroll(isOpen) {
  useEffect(() => {
    if (!isOpen) return;
    const scrollY = window.scrollY;
    const { overflow, position, top, width } = document.body.style;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    return () => {
      document.body.style.overflow = overflow;
      document.body.style.position = position;
      document.body.style.top = top;
      document.body.style.width = width;
      window.scrollTo(0, scrollY);
    };
  }, [isOpen]);
}

function EventModal({ 
  isOpen = true, 
  onClose, 
  isEditing = false,
  initialData, 
  onSave
}) {
  useLockBodyScroll(isOpen);
  const [form, setForm] = useState({
    event_name: '',
    event_tag: '',
    start_month: 1,
    start_day: 1,
    end_month: 1,
    end_day: 1,
    is_active: true
  });

  useEffect(() => {
    if (isOpen) {
      setForm(initialData || {
        event_name: '',
        event_tag: '',
        start_month: 1,
        start_day: 1,
        end_month: 1,
        end_day: 1,
        is_active: true
      });
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave(form);
  };

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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Event' : 'Add New Event'}
      size="sm"
      footer={
        <div className="flex items-center justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSave}>
            {isEditing ? 'Save Changes' : 'Save Event'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">

        <Input
          label="Event Name"
          required
          value={form.event_name}
          onChange={(e) => setForm({ ...form, event_name: e.target.value })}
          placeholder="e.g. Valentine's Promo"
        />

        <Input
          label="AI Recommendation Tag"
          required
          value={form.event_tag}
          onChange={(e) => setForm({ ...form, event_tag: e.target.value })}
          placeholder="e.g. valentines"
          hint="This tells the AI which products to highlight on the homepage. Must match exactly with your product tags."
        />

        <div className="grid grid-cols-2 gap-4">

          <div className="w-full">
            <label className="text-[11px] font-bold uppercase tracking-wider text-brand-500 mb-1.5 block">
              Start Date (Annual) <span className="text-red-500 ml-0.5">*</span>
            </label>
            <div className="flex gap-2">
              <div className="flex-1">
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
              <div className="w-16 shrink-0">
                <CustomDropdown 
                  value={form.start_day}
                  options={startDayOptions}
                  openUpwards={true}
                  onChange={(newDay) => setForm({...form, start_day: newDay})}
                />
              </div>
            </div>
          </div>

          <div className="w-full">
            <label className="text-[11px] font-bold uppercase tracking-wider text-brand-500 mb-1.5 block">
              End Date (Annual) <span className="text-red-500 ml-0.5">*</span>
            </label>
            <div className="flex gap-2">
              <div className="flex-1">
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
              <div className="w-16 shrink-0">
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

      </div>
    </Modal>
  );
}

// ============================================================
// CONFIRM TOAST
// Toast na lumalabas sa ibaba-kanan (hindi buong-screen na overlay
// gaya ng modal) na may Confirm/Cancel — papalit ito sa native
// window.confirm() para consistent ang look sa buong app at hindi
// yung "localhost says" na browser dialog ang lumalabas.
// ============================================================

function ConfirmToast({ isOpen, message, onConfirm, onCancel, isLoading }) {
  if (!isOpen) return null;

  return (
    <div className="fixed bottom-6 right-6 left-6 sm:left-auto z-[70] sm:w-full sm:max-w-sm">
      <div className="bg-white rounded-2xl shadow-2xl border border-[#EAE4E0] p-5 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-red-50 text-red-600 flex items-center justify-center shrink-0">
            <Trash2 size={14} />
          </div>
          <p className="text-xs font-semibold text-[#3B1F0A] leading-relaxed pt-1.5">
            {message}
          </p>
        </div>
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="bg-white text-[#5A453C] border border-[#DED4CC] hover:bg-[#F5EFEB] px-4 py-2 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="bg-red-600 text-white hover:bg-red-700 px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            {isLoading ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            Delete
          </button>
        </div>
      </div>
    </div>
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

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);

  // State para sa delete confirmation toast (papalit sa window.confirm)
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

  useEffect(() => {
    const handleDataChanged = () => fetchEvents(true, true);
    window.addEventListener('cake:data-changed', handleDataChanged);
    return () => {
      window.removeEventListener('cake:data-changed', handleDataChanged);
    };
  }, []);

  const handleOpenAdd = () => {
    setSelectedEvent(null);
    setIsEditing(false);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (event) => {
    setSelectedEvent(event);
    setIsEditing(true);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    if (isSaving) return; // huwag payagan mag-close habang nagse-save
    setIsModalOpen(false);
    setSelectedEvent(null);
  };

  // Add / Edit — POST kung bagong event, PUT kung mayroon nang id
  const handleSave = async (formData) => {
    setIsSaving(true);
    setError(null);
    try {
      const isUpdate = isEditing && formData.id;
      const res = await fetch(`${API_BASE}/events${isUpdate ? `/${formData.id}` : ''}`, {
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
      setError(err.message);
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
      const res = await fetch(`${API_BASE}/events/${deleteTarget.id}`, { method: 'DELETE', credentials: 'include' });
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

  return (
    <div>
      {/* Palaging ipakita ang scrollbar ng page (kahit maikli lang ang laman
          gaya ngayon dahil kaunti pa lang ang events) para hindi
          "gumagalaw"/lumiliit ang layout tuwing nagpapalit ng dami ng laman
          ang page. */}
      <style>{`html { overflow-y: scroll; }`}</style>

      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#3B1F0A]">Event Manager</h1>
          <p className="text-xs sm:text-sm text-[#8A7264] mt-1">Manage seasonal events and AI product recommendations</p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="bg-[#3B1F0A] text-white hover:bg-[#2A1608] px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-colors shadow-md flex items-center gap-1.5 shrink-0"
        >
          <Plus size={16} /> Add New Event
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-xs text-red-600 font-medium">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="bg-white rounded-2xl border border-[#EAE4E0] shadow-sm px-7 py-14 flex flex-col items-center justify-center gap-2 text-xs text-[#8A7264]">
          <Loader2 size={18} className="animate-spin" />
          Loading events...
        </div>
      ) : events.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#EAE4E0] shadow-sm px-7 py-14 text-center text-xs text-[#8A7264]">
          No events yet. Click "Add New Event" to create one.
        </div>
      ) : (
        <>
          {/* TABLE — makikita mula md breakpoint pataas (tablet/desktop).
              Gamit na ang mismong Table/Tr/Td/Badge/Button mula sa shared ../ui
              (kaparehong components na ginagamit ng Orders) para eksaktong
              magkatugma ang header bar, badge, at action buttons — hindi na
              hex-approximation lang. */}
          <div className="hidden md:block bg-white rounded-2xl border border-[#EAE4E0] overflow-hidden shadow-sm">
            <Table columns={[
              { label: 'Event' }, { label: 'AI Tag' }, { label: 'Date Range' },
              { label: 'Status' }, { label: 'Action', align: 'right' },
            ]}>
              {events.map((event) => (
                <Tr key={event.id}>
                  <Td className="font-semibold text-brand-900">{event.event_name}</Td>
                  <Td>{event.event_tag}</Td>
                  <Td className="whitespace-nowrap">
                    {formatDate(event.start_month, event.start_day)} – {formatDate(event.end_month, event.end_day)}
                  </Td>
                  <Td>
                    <Badge variant={event.is_active ? 'success' : 'default'}>
                      {event.is_active ? 'Active' : 'Inactive'}
                    </Badge>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 md:hidden gap-4">
            {events.map((event) => (
              <div
                key={event.id}
                className="bg-white rounded-2xl border border-[#EAE4E0] shadow-sm p-5 flex flex-col gap-3 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-xs sm:text-sm font-bold text-[#3B1F0A] leading-snug break-words">
                    {event.event_name}
                  </h3>
                  <Badge variant={event.is_active ? 'success' : 'default'} className="shrink-0">
                    {event.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[10px] font-bold text-[#8A7264] uppercase tracking-wider w-16 shrink-0">
                      AI Tag
                    </span>
                    <span className="text-xs text-[#5A453C] break-words">{event.event_tag}</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-[10px] font-bold text-[#8A7264] uppercase tracking-wider w-16 shrink-0">
                      Dates
                    </span>
                    <span className="text-xs text-[#5A453C] whitespace-nowrap">
                      {formatDate(event.start_month, event.start_day)} – {formatDate(event.end_month, event.end_day)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 mt-1 pt-3 border-t border-[#EAE4E0]">
                  <Button size="sm" variant="secondary" className="text-xs px-3 py-1.5" onClick={() => handleOpenEdit(event)}>
                    <Pencil size={12} /> Edit
                  </Button>
                  <Button size="sm" variant="danger" className="text-xs px-3 py-1.5" onClick={() => requestDelete(event)}>
                    <Trash2 size={12} /> Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <EventModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        isEditing={isEditing}
        initialData={selectedEvent}
        onSave={handleSave}
      />

      <ConfirmToast
        isOpen={!!deleteTarget}
        message={`Are you sure you want to delete "${deleteTarget?.event_name}"?`}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
        isLoading={isDeleting}
      />
    </div>
  );
}
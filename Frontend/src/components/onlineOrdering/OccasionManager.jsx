import { useState, useEffect, useRef } from 'react';
import { X, ChevronDown, Trash2, Plus, Pencil, Loader2 } from 'lucide-react';

// Base URL ng backend. Kinukuha mula sa VITE_API_URL sa .env
// (hal. VITE_API_URL=http://localhost:3000/api — kasama na ang "/api"
// dito, kaya "/products" na lang ang idinadagdag natin sa ibaba,
// hindi na "/api/products" para hindi maging "/api/api/products").
const API_BASE = `${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/online-ordering/products`;

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

function EventModal({ 
  isOpen = true, 
  onClose, 
  isEditing = false,
  initialData, 
  onSave,
  onDelete // BAGONG DAGDAG: prop para sa delete handler
}) {
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

  const handleDelete = () => {
    // Native browser confirm lang para walang overlapping modals
    if (window.confirm(`Are you sure you want to delete "${form.event_name}"?`)) {
      onDelete(form.id); 
    }
  };

  const monthOptions = MONTHS.map(m => ({ value: m.val, label: m.label }));
  
  const startMaxDays = getDaysInMonth(form.start_month);
  const startDayOptions = Array.from({ length: startMaxDays }, (_, i) => ({ value: i + 1, label: (i + 1).toString() }));

  const endMaxDays = getDaysInMonth(form.end_month);
  const endDayOptions = Array.from({ length: endMaxDays }, (_, i) => ({ value: i + 1, label: (i + 1).toString() }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1F1108]/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden border border-[#EAE4E0]">
        
        <div className="flex items-center justify-between px-7 py-5 border-b border-[#EAE4E0] bg-white shrink-0">
          <h2 className="text-xl font-serif font-bold text-[#3B1F0A]">
            {isEditing ? 'Edit Event' : 'Add New Event'}
          </h2>
          <button 
            onClick={onClose} 
            className="w-8 h-8 rounded-full flex items-center justify-center text-[#8A7264] hover:bg-[#F5EFEB] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-7 py-6 overflow-y-auto flex flex-col gap-5">
          
          <div className="w-full">
            <label className="text-[10px] font-bold text-[#8A7264] mb-1.5 block uppercase tracking-wider">
              Event Name <span className="text-red-500">*</span>
            </label>
            <input 
              type="text" 
              value={form.event_name} 
              onChange={(e) => setForm({...form, event_name: e.target.value})} 
              placeholder="e.g. Valentine's Promo" 
              className="w-full border border-[#DED4CC] rounded-xl px-3.5 py-2.5 text-xs outline-none focus:border-[#5A453C] bg-white transition-colors placeholder:text-gray-400" 
            />
          </div>

          <div className="w-full">
            <label className="text-[10px] font-bold text-[#8A7264] mb-1.5 block uppercase tracking-wider">
              AI Recommendation Tag <span className="text-red-500">*</span>
            </label>
            <input 
              type="text" 
              value={form.event_tag} 
              onChange={(e) => setForm({...form, event_tag: e.target.value})} 
              placeholder="e.g. valentines" 
              className="w-full border border-[#DED4CC] rounded-xl px-3.5 py-2.5 text-xs outline-none focus:border-[#5A453C] bg-white transition-colors placeholder:text-gray-400"
            />
            <p className="text-[10px] text-[#8A7264] mt-1.5 italic">
              This tells the AI which products to highlight on the homepage. Must match exactly with your product tags.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            
            <div className="w-full">
              <label className="text-[10px] font-bold text-[#8A7264] mb-1.5 block uppercase tracking-wider">
                Start Date (Annual) <span className="text-red-500">*</span>
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
              <label className="text-[10px] font-bold text-[#8A7264] mb-1.5 block uppercase tracking-wider">
                End Date (Annual) <span className="text-red-500">*</span>
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
              className="w-4 h-4 accent-[#3B1F0A] rounded cursor-pointer border-[#DED4CC]" 
            />
            <label 
              htmlFor="activeToggle" 
              className="text-xs font-bold uppercase tracking-wider text-[#3B1F0A] select-none cursor-pointer"
            >
              Set as Active
            </label>
          </div>

        </div>

        {/* MODIFIED FOOTER PARA SA DELETE AND UPDATE */}
        <div className="px-7 py-4 border-t border-[#EAE4E0] bg-white shrink-0 flex items-center justify-between">
          
          {/* Lilitaw lang ang Delete Button kapag nag-e-edit */}
          {isEditing ? (
            <button 
              onClick={handleDelete}
              className="text-red-600 bg-red-50 hover:bg-red-100 px-4 py-2.5 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
            >
              <Trash2 size={14} /> Delete
            </button>
          ) : (
            <div></div> /* Empty div para hindi masira ang flex layout (space-between) */
          )}

          <div className="flex items-center gap-3 ml-auto">
            <button 
              onClick={onClose} 
              className="bg-white text-[#5A453C] border border-[#DED4CC] hover:bg-[#F5EFEB] px-5 py-2.5 rounded-xl text-xs font-semibold transition-colors"
            >
              Cancel
            </button>
            <button 
              onClick={handleSave} 
              className="bg-[#3B1F0A] text-white hover:bg-[#2A1608] px-5 py-2.5 rounded-xl text-xs font-semibold transition-colors shadow-md"
            >
              {isEditing ? 'Save Changes' : 'Save Event'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

// ============================================================
// PARENT COMPONENT: OccasionManager
// Dito na-connect sa backend (/occasions endpoints) yung
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

export default function OccasionManager() {
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);

  // Kunin lahat ng occasions mula sa backend
  const fetchOccasions = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/occasions`);
      const data = await parseResponse(res);
      setEvents(data || []);
    } catch (err) {
      console.error('Fetch Occasions Error:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOccasions();
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
      const res = await fetch(`${API_BASE}/occasions${isUpdate ? `/${formData.id}` : ''}`, {
        method: isUpdate ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      await parseResponse(res);
      await fetchOccasions(); // i-refresh yung list galing sa totoong database
      handleCloseModal();
    } catch (err) {
      console.error('Save Occasion Error:', err);
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Delete mula sa loob ng modal
  const handleDelete = async (id) => {
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/occasions/${id}`, { method: 'DELETE' });
      await parseResponse(res);
      await fetchOccasions();
      handleCloseModal();
    } catch (err) {
      console.error('Delete Occasion Error:', err);
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Quick delete diretso sa row, walang kailangang buksan ang modal muna
  const handleQuickDelete = async (event) => {
    if (!window.confirm(`Are you sure you want to delete "${event.event_name}"?`)) return;

    setError(null);
    try {
      const res = await fetch(`${API_BASE}/occasions/${event.id}`, { method: 'DELETE' });
      await parseResponse(res);
      setEvents(prev => prev.filter(ev => ev.id !== event.id));
    } catch (err) {
      console.error('Quick Delete Occasion Error:', err);
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF7F4] p-8">
      <div className="max-w-4xl mx-auto">

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-serif font-bold text-[#3B1F0A]">Occasion Manager</h1>
            <p className="text-xs text-[#8A7264] mt-1">Manage seasonal events and AI product recommendations</p>
          </div>
          <button
            onClick={handleOpenAdd}
            className="bg-[#3B1F0A] text-white hover:bg-[#2A1608] px-5 py-2.5 rounded-xl text-xs font-semibold transition-colors shadow-md flex items-center gap-1.5 shrink-0"
          >
            <Plus size={14} /> Add New Event
          </button>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-xs text-red-600 font-medium">
            {error}
          </div>
        )}

        <div className="bg-white rounded-2xl border border-[#EAE4E0] overflow-hidden shadow-sm">
          {isLoading ? (
            <div className="px-7 py-14 flex flex-col items-center justify-center gap-2 text-xs text-[#8A7264]">
              <Loader2 size={18} className="animate-spin" />
              Loading occasions...
            </div>
          ) : events.length === 0 ? (
            <div className="px-7 py-14 text-center text-xs text-[#8A7264]">
              No events yet. Click "Add New Event" to create one.
            </div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="bg-[#F5EFEB] text-[10px] font-bold text-[#8A7264] uppercase tracking-wider">
                  <th className="px-7 py-3">Event</th>
                  <th className="px-4 py-3">AI Tag</th>
                  <th className="px-4 py-3">Date Range</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-7 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAE4E0]">
                {events.map((event) => (
                  <tr key={event.id} className="hover:bg-[#FAF7F4] transition-colors">
                    <td className="px-7 py-4 text-xs font-semibold text-[#3B1F0A]">{event.event_name}</td>
                    <td className="px-4 py-4 text-xs text-[#5A453C]">{event.event_tag}</td>
                    <td className="px-4 py-4 text-xs text-[#5A453C] whitespace-nowrap">
                      {formatDate(event.start_month, event.start_day)} – {formatDate(event.end_month, event.end_day)}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                          event.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {event.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-7 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenEdit(event)}
                          className="w-7 h-7 rounded-full flex items-center justify-center text-[#8A7264] hover:bg-[#F5EFEB] hover:text-[#3B1F0A] transition-colors"
                          title="Edit"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => handleQuickDelete(event)}
                          className="w-7 h-7 rounded-full flex items-center justify-center text-[#8A7264] hover:bg-red-50 hover:text-red-600 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <EventModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        isEditing={isEditing}
        initialData={selectedEvent}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </div>
  );
}
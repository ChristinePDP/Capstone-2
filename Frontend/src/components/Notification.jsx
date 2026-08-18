import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, X, ShoppingBag, CheckCheck, Trash2, ChevronRight } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL;

// Per-type icon + tint, so the eye can sort notifications by kind at a glance
// instead of reading every title.
const TYPE_STYLE = {
  new_order: { icon: ShoppingBag, iconBg: 'bg-brand-50', iconColor: 'text-brand-600' },
};
const DEFAULT_STYLE = { icon: Bell, iconBg: 'bg-brand-50', iconColor: 'text-brand-500' };

// Saan dapat dalhin ang user pag pinindot niya ang isang notification, per
// referenceType. Order-related notifications (new_order, atbp.) → All Orders
// tab. Idagdag lang dito ang bagong mapping kapag may bagong referenceType.
const REDIRECT_MAP = {
  order: '/orders',
};

const timeAgo = (isoDate) => {
  const diffSec = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
  if (diffSec < 60) return 'Ngayon lang';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
};

const isToday = (isoDate) => {
  const d = new Date(isoDate);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
};

// Grupuhin ang listahan sa "Today" at "Earlier" — mas mabilis mahanap ng
// mata kung saan tumigil ang bago, karaniwang pattern sa mga notification
// panel (Gmail, Slack, Linear).
const groupByDay = (items) => {
  const today = [];
  const earlier = [];
  items.forEach(n => (isToday(n.created_at) ? today : earlier).push(n));
  return [
    ...(today.length ? [{ label: 'Today', items: today }] : []),
    ...(earlier.length ? [{ label: 'Earlier', items: earlier }] : []),
  ];
};

function NotificationRow({ n, onOpen, onDelete }) {
  const { icon: Icon, iconBg, iconColor } = TYPE_STYLE[n.type] || DEFAULT_STYLE;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(n)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen(n)}
      className={`group w-full text-left px-4 py-3 border-b border-brand-100 last:border-0 hover:bg-brand-50/70 transition-colors flex gap-3 cursor-pointer outline-none focus-visible:bg-brand-50/70 ${
        n.is_read ? '' : 'bg-brand-50/40'
      }`}
    >
      <div className={`w-9 h-9 rounded-full ${iconBg} flex items-center justify-center shrink-0 ${iconColor}`}>
        <Icon size={16} strokeWidth={2.1} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-[13px] leading-snug ${n.is_read ? 'font-semibold text-brand-700' : 'font-bold text-brand-800'}`}>
            {n.title}
          </p>
          {!n.is_read && <span className="w-2 h-2 rounded-full bg-brand-600 shrink-0 mt-1.5" />}
        </div>
        {n.message && (
          <p className="text-[12px] text-brand-500 mt-0.5 leading-snug line-clamp-2">{n.message}</p>
        )}
        <p className="text-[11px] text-brand-400 mt-1">{timeAgo(n.created_at)}</p>
      </div>

      {/* Redirect cue — laging bisible sa touch (walang hover doon), lumalabas
          sa hover/focus sa desktop. Ipinapakita na may pupuntahan pag pinindot. */}
      <div className="shrink-0 flex flex-col items-center justify-between self-stretch">
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(n.id); }}
          className="w-6 h-6 flex items-center justify-center rounded-lg text-brand-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-100 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100"
          aria-label="Delete notification"
          title="Delete"
        >
          <Trash2 size={13} />
        </button>
        <ChevronRight
          size={14}
          className="text-brand-200 md:opacity-0 md:group-hover:opacity-100 md:group-focus-visible:opacity-100 transition-opacity mb-0.5"
        />
      </div>
    </div>
  );
}

export default function Notification() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const panelRef = useRef(null);
  const navigate = useNavigate();

  const unreadCount = items.filter(n => !n.is_read).length;
  const groups = groupByDay(items);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/notifications`);
      const json = await res.json();
      if (json.success) setItems(json.data);
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000); // simple poll; swap for Supabase Realtime later
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  useEffect(() => {
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const markRead = async (id) => {
    setItems(prev => prev.map(n => (n.id === id ? { ...n, is_read: true } : n)));
    try {
      await fetch(`${API_BASE}/notifications/${id}/read`, { method: 'PATCH' });
    } catch (error) {
      console.error('Failed to mark notification read:', error);
    }
  };

  const markAllRead = async () => {
    setItems(prev => prev.map(n => ({ ...n, is_read: true })));
    try {
      await fetch(`${API_BASE}/notifications/read-all`, { method: 'PATCH' });
    } catch (error) {
      console.error('Failed to mark all read:', error);
    }
  };

  const deleteNotification = async (id) => {
    // Optimistic remove; kung mag-fail ang request, ibalik natin ang item
    // sa list para hindi maligaw ang user na na-delete na siya.
    const prevItems = items;
    setItems(prev => prev.filter(n => n.id !== id));
    try {
      const res = await fetch(`${API_BASE}/notifications/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
    } catch (error) {
      console.error('Failed to delete notification:', error);
      setItems(prevItems);
    }
  };

  // Pinindot na notification → mark as read + isara ang panel + dalhin sa
  // kaukulang tab (All Orders para sa order-related notifications).
  const openNotification = (n) => {
    if (!n.is_read) markRead(n.id);
    setOpen(false);
    const destination = REDIRECT_MAP[n.reference_type];
    if (destination) navigate(destination);
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(v => !v)}
        className="relative w-9 h-9 md:w-10 md:h-10 rounded-xl border border-brand-200 flex items-center justify-center text-brand-500 hover:bg-brand-50 hover:text-brand-700 transition-colors"
        aria-label="Notifications"
      >
        <Bell size={16} strokeWidth={2} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-[3px] rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none ring-2 ring-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-11 w-[calc(100vw-2rem)] max-w-[360px] bg-white border border-brand-200 rounded-2xl shadow-xl overflow-hidden z-50 origin-top-right animate-modalIn"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-brand-100">
            <div className="flex items-center gap-2">
              <p className="text-[15px] font-bold text-brand-800">Notifications</p>
              {unreadCount > 0 && (
                <span className="text-[11px] font-bold text-brand-600 bg-brand-50 px-1.5 py-[1px] rounded-full leading-none">
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-1 text-[11px] font-semibold text-brand-500 hover:text-brand-700 hover:bg-brand-50 px-2 py-1 rounded-lg transition-colors"
                  aria-label="Mark all as read"
                  title="Mark all as read"
                >
                  <CheckCheck size={13} />
                  <span className="hidden sm:inline">Mark all read</span>
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="w-6 h-6 flex items-center justify-center rounded-lg text-brand-400 hover:text-brand-700 hover:bg-brand-50 transition-colors"
                aria-label="Close"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              // Skeleton rows — mas maganda ang perceived speed kaysa sa
              // plain "Loading..." text, at binibigyan ng preview kung
              // paano magmumukha ang list.
              <div className="px-4 py-3 space-y-4">
                {[0, 1, 2].map(i => (
                  <div key={i} className="flex gap-3 animate-pulse">
                    <div className="w-9 h-9 rounded-full bg-brand-100 shrink-0" />
                    <div className="flex-1 space-y-2 py-0.5">
                      <div className="h-2.5 bg-brand-100 rounded w-3/5" />
                      <div className="h-2 bg-brand-100 rounded w-4/5" />
                    </div>
                  </div>
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="py-10 px-6 text-center">
                <div className="w-11 h-11 mx-auto mb-3 rounded-full bg-brand-50 flex items-center justify-center">
                  <Bell size={18} className="text-brand-300" />
                </div>
                <p className="text-[13px] font-semibold text-brand-600">You're all caught up</p>
                <p className="text-[12px] text-brand-400 mt-0.5">Walang bagong notifications sa ngayon.</p>
              </div>
            ) : (
              groups.map(group => (
                <div key={group.label}>
                  <p className="px-4 pt-2.5 pb-1 text-[10px] font-bold text-brand-400 uppercase tracking-wider bg-brand-50/40">
                    {group.label}
                  </p>
                  {group.items.map(n => (
                    <NotificationRow key={n.id} n={n} onOpen={openNotification} onDelete={deleteNotification} />
                  ))}
                </div>
              ))
            )}
          </div>

          {/* Footer — laging bukas na daan papunta sa All Orders, kahit walang
              partikular na napindot na notification. */}
          {!loading && items.length > 0 && (
            <button
              onClick={() => { setOpen(false); navigate('/orders'); }}
              className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 text-[12px] font-semibold text-brand-600 hover:text-brand-800 hover:bg-brand-50 border-t border-brand-100 transition-colors"
            >
              View All Orders
              <ChevronRight size={13} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
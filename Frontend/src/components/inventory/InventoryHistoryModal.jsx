import { useState, useEffect, useRef } from 'react';
import { History as HistoryIcon } from 'lucide-react';
import { useApp } from '../../context/AppContext';

const formatDT = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
};

// ─── RESTOCK HISTORY PANEL ─────────────────────────────────────
// Inline panel (HINDI hiwalay na modal) na ipinapakita sa loob mismo
// ng Restock/Add Stock modal — para iisang pindot lang ang kailangan
// para makita ang stock ngayon AT ang dating restock history, sa
// halip na magbukas pa ng ibang modal.
//
// Restock entries LANG ang ipinapakita dito (transaction_type IN,
// action === 'Restock') — hindi na kasama ang Waste o Production
// deductions (OUT), dahil ang purpose lang naman ng panel na ito ay
// ipakita "kailan, ilan, at magkano" ang bawat restock — hindi
// kailangan ang buong IN/OUT trail dito.
export function RestockHistoryPanel({ itemName }) {
  const { fetchInventoryHistory } = useApp() || {};
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Stable ref para sa context function — proteksyon laban sa
  // unstable function reference mula sa AppContext (tingnan ang
  // paliwanag sa naunang bersyon ng file na ito).
  const fetchRef = useRef(fetchInventoryHistory);
  useEffect(() => {
    fetchRef.current = fetchInventoryHistory;
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!itemName || !fetchRef.current) return;
      setLoading(true);
      setErrorMsg('');
      try {
        const data = await fetchRef.current(itemName);
        const restocksOnly = (Array.isArray(data) ? data : [])
          .filter(log => log.action === 'Restock');
        if (!cancelled) setLogs(restocksOnly);
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err.message || 'Hindi makuha ang history.');
          setLogs([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [itemName]);

  if (!itemName) return null;

  return (
    <div className="pt-4 mt-4 border-t border-brand-100">
      <div className="flex items-center gap-1.5 mb-2">
        <HistoryIcon size={13} className="text-brand-400" />
        <span className="text-[11px] font-bold uppercase tracking-wide text-brand-400">Restock History</span>
      </div>

      <div className="max-h-40 overflow-y-auto rounded-lg border border-brand-100 bg-brand-50/30">
        {loading && (
          <div className="py-6 text-center text-xs text-brand-400 font-medium">Naglo-load...</div>
        )}

        {!loading && errorMsg && (
          <div className="py-6 text-center text-xs text-red-500 font-medium">{errorMsg}</div>
        )}

        {!loading && !errorMsg && !logs.length && (
          <div className="py-6 text-center text-xs text-brand-400 font-medium">
            Wala pang restock history para dito.
          </div>
        )}

        {!loading && !errorMsg && logs.length > 0 && (
          <div className="divide-y divide-brand-100">
            {logs.map((log, idx) => (
              <div key={`${log.created_at}-${idx}`} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-bold text-brand-700">Restock</span>
                  <span className="text-[11px] text-brand-400 truncate">{formatDT(log.created_at)}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-bold text-green-700">+{log.quantity}</span>
                  {log.cost > 0 && (
                    <span className="text-[11px] text-brand-400">₱{Number(log.cost).toFixed(2)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export { HistoryIcon };
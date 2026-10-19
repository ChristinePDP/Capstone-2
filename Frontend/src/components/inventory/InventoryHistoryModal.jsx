import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { History as HistoryIcon } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ConfirmModal, useToast, Pagination } from '../ui';

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

const PAGE_SIZE = 5;
const isVoidableStockEntry = (log) => ['Restock', 'Initial Stock'].includes(log.action);

// ─── RESTOCK HISTORY PANEL ─────────────────────────────────────
export function RestockHistoryPanel({ itemName, itemType, itemId, onVoided }) {
  const { fetchInventoryHistory, voidRestockLog } = useApp() || {};
  const { show } = useToast();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [confirmLog, setConfirmLog] = useState(null);
  const [isBulkConfirmOpen, setIsBulkConfirmOpen] = useState(false);
  const [insufficientLog, setInsufficientLog] = useState(null);
  const [insufficientDetail, setInsufficientDetail] = useState('');
  const [voidingId, setVoidingId] = useState(null);

  const [page, setPage] = useState(1);
  const historyRequestRef = useRef(0);

  const fetchRef = useRef(fetchInventoryHistory);
  useEffect(() => {
    fetchRef.current = fetchInventoryHistory;
  });

  const loadHistory = useCallback(async ({ silent = false } = {}) => {
    if (!itemName || !fetchRef.current) return;
    const requestId = ++historyRequestRef.current;
    if (!silent) {
      setLoading(true);
      setErrorMsg('');
    }
    try {
      const data = await fetchRef.current(itemName, itemType, itemId);
      const stockEntries = (Array.isArray(data) ? data : [])
        .filter(log => ['Initial Stock', 'Restock'].includes(log.action));
      if (requestId === historyRequestRef.current) setLogs(stockEntries);
    } catch (err) {
      if (requestId === historyRequestRef.current && !silent) {
        setErrorMsg(err.message || 'Hindi makuha ang history.');
        setLogs([]);
      }
    } finally {
      if (requestId === historyRequestRef.current) setLoading(false);
    }
  }, [itemName, itemId, itemType]);

  useEffect(() => {
    setPage(1);
    setSelectedIds([]);
    setSelectionMode(false);
    loadHistory();
  }, [itemName, itemType, itemId, loadHistory]);

  useEffect(() => {
    const handleDataChanged = (event) => {
      const change = event.detail || {};
      if (change.table !== 'inventory_logs') return;
      const log = change.record;
      if (!log) return;
      const linkedId = itemType === 'raw' ? log.raw_ingredient_id : log.material_id;
      const typeMatches = log.item_type === itemType;
      if ((linkedId && String(linkedId) === String(itemId))
        || (typeMatches && log.item_name === itemName)) {
        if (log.id && ['Initial Stock', 'Restock'].includes(log.action)) {
          historyRequestRef.current += 1;
          setLoading(false);
          setErrorMsg('');
          setPage(1);
          setLogs(previous => [log, ...previous.filter(entry => String(entry.id) !== String(log.id))]
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
        } else {
          loadHistory({ silent: true });
        }
      }
    };
    window.addEventListener('cake:data-changed', handleDataChanged);
    return () => window.removeEventListener('cake:data-changed', handleDataChanged);
  }, [itemId, itemName, itemType, loadHistory]);

  const totalPages = Math.max(1, Math.ceil(logs.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const pagedLogs = useMemo(
    () => logs.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [logs, safePage]
  );

  const activeLogs = useMemo(() => logs.filter(l => !l.voided_at && isVoidableStockEntry(l)), [logs]);
  const activeIdsOnPage = pagedLogs.filter(l => !l.voided_at && isVoidableStockEntry(l)).map(l => l.id);
  const allSelectedOnPage = activeIdsOnPage.length > 0 && activeIdsOnPage.every(id => selectedIds.includes(id));

  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const toggleSelectAllOnPage = () => {
    if (allSelectedOnPage) {
      setSelectedIds(prev => prev.filter(id => !activeIdsOnPage.includes(id)));
    } else {
      setSelectedIds(prev => Array.from(new Set([...prev, ...activeIdsOnPage])));
    }
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds([]);
  };

  const runVoid = async (log, force = false) => {
    if (!voidRestockLog || !log) return;
    setVoidingId(log.id);
    try {
      await voidRestockLog(log.id, force);
      onVoided?.();
      show('Stock entry voided.', 'success');
      setConfirmLog(null);
      setInsufficientLog(null);
      setSelectedIds([]);
      setSelectionMode(false);
      await loadHistory();
    } catch (err) {
      if (err.cause?.response?.status === 409) {
        setConfirmLog(null);
        setInsufficientLog(log);
        setInsufficientDetail('The entry is larger than the remaining stock. Some quantity may have been used in production or waste.');
      } else {
        show(err.message || 'Could not void the stock entry.', 'error');
        setConfirmLog(null);
      }
    } finally {
      setVoidingId(null);
    }
  };

  const runBulkVoid = async () => {
    if (!selectedIds.length || !voidRestockLog) return;
    setIsBulkConfirmOpen(false);
    setLoading(true);

    let successCount = 0;
    let failCount = 0;

    for (const id of selectedIds) {
      try {
        await voidRestockLog(id, false);
        successCount++;
      } catch {
        failCount++;
      }
    }

    if (successCount > 0) show(`Voided ${successCount} stock entr${successCount === 1 ? 'y' : 'ies'}.`, 'success');
    if (successCount > 0) onVoided?.();
    if (failCount > 0) show(`Could not void ${failCount} entr${failCount === 1 ? 'y' : 'ies'} because of insufficient stock or a conflict.`, 'error');

    setSelectedIds([]);
    setSelectionMode(false);
    await loadHistory();
    setLoading(false);
  };

  const handleInitiateVoid = () => {
    if (selectedIds.length === 1) {
      const target = logs.find(l => l.id === selectedIds[0]);
      if (target) setConfirmLog(target);
    } else if (selectedIds.length > 1) {
      setIsBulkConfirmOpen(true);
    }
  };

  if (!itemName) return null;

  return (
    <div className="pt-4 mt-4 border-t border-brand-100">
      {/* Header & Mode Actions */}
      <div className="flex items-center justify-between mb-2.5 flex-wrap gap-2">
        <div className="flex items-center gap-1.5">
          <HistoryIcon size={13} className="text-brand-400" />
          <span className="text-[11px] font-bold uppercase tracking-wide text-brand-400">Stock History</span>
          {logs.length > 0 && (
            <span className="text-[10px] text-brand-400 font-medium">({logs.length})</span>
          )}
        </div>

        {!loading && activeLogs.length > 0 && (
          !selectionMode ? (
            <button
              type="button"
              onClick={() => setSelectionMode(true)}
              className="text-[11px] font-bold text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 px-2.5 py-1 rounded-md transition-all"
            >
              Select to Void
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={selectedIds.length === 0}
                onClick={handleInitiateVoid}
                className="px-2.5 py-1 text-[11px] font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed rounded shadow-sm transition-all"
              >
                Void Selected ({selectedIds.length})
              </button>
              <button type="button" onClick={exitSelectionMode} className="px-2 py-1 text-[11px] font-medium text-brand-500 hover:text-brand-700 bg-brand-50 rounded">
                Cancel
              </button>
            </div>
          )
        )}
      </div>

      {selectionMode && (
        <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1 mb-2">
          {selectedIds.length === 0 ? 'Check entries below you want to void.' : `${selectedIds.length} selected.`}
        </p>
      )}

      {/* Log Container */}
      <div className="rounded-lg border border-brand-100 bg-brand-50/30 overflow-hidden">
        {loading && (
          <div className="py-6 text-center text-xs text-brand-400 font-medium">Naglo-load...</div>
        )}

        {!loading && errorMsg && (
          <div className="py-6 text-center text-xs text-red-500 font-medium">{errorMsg}</div>
        )}

        {!loading && !errorMsg && !logs.length && (
          <div className="py-6 text-center text-xs text-brand-400 font-medium">
            Wala pang stock history para dito.
          </div>
        )}

        {!loading && !errorMsg && logs.length > 0 && (
          <>
            {/* 📱 MOBILE CARDS */}
            <div className="block sm:hidden divide-y divide-brand-100 bg-white">
              {pagedLogs.map((log, idx) => {
                const isVoided = Boolean(log.voided_at);
                const isSelected = selectedIds.includes(log.id);
                return (
                  <div
                    key={log.id ?? `${log.created_at}-${idx}`}
                    className={`p-3 flex items-start gap-2.5 ${isVoided ? 'opacity-50' : isSelected ? 'bg-red-50/40' : ''}`}
                  >
                    {selectionMode && !isVoided && isVoidableStockEntry(log) && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(log.id)}
                        className="mt-1 shrink-0 rounded border-brand-300 text-red-600 focus:ring-red-500"
                      />
                    )}
                    <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          {isVoided ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-[4px] text-[10px] font-bold bg-red-100 text-red-600">Voided</span>
                          ) : (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-[4px] text-[10px] font-bold bg-green-100 text-green-700">{log.action}</span>
                          )}
                        </div>
                        <p className="text-[11px] text-brand-500">{formatDT(log.created_at)}</p>
                        {/* BAGONG DAGDAG: Expiration Date */}
                        {log.expiration_date && (
                          <p className="text-[10px] font-medium text-amber-600 mt-0.5">
                            Exp: {new Date(log.expiration_date).toLocaleDateString('en-PH')}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`font-bold text-sm ${isVoided ? 'line-through text-brand-400' : 'text-green-600'}`}>+{log.quantity} {log.unit}</p>
                        {log.cost > 0 && <p className="text-[11px] text-brand-500">₱{Number(log.cost).toFixed(2)}</p>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 💻 DESKTOP TABLE */}
            <table className="hidden sm:table w-full text-left text-sm">
              <thead className="bg-brand-50/90 border-b border-brand-100 text-[10px] uppercase tracking-wider text-brand-500">
                <tr>
                  {selectionMode && (
                    <th className="px-3 py-2 w-8 text-center">
                      <input
                        type="checkbox"
                        onChange={toggleSelectAllOnPage}
                        checked={allSelectedOnPage}
                        className="rounded border-brand-300 text-red-600 focus:ring-red-500 cursor-pointer"
                      />
                    </th>
                  )}
                  <th className="px-3 py-2 font-bold">Date &amp; Time</th>
                  <th className="px-3 py-2 font-bold">Action</th>
                  <th className="px-3 py-2 font-bold">Expiration</th>
                  <th className="px-3 py-2 font-bold text-right">Qty</th>
                  <th className="px-3 py-2 font-bold text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-100 bg-white">
                {pagedLogs.map((log, idx) => {
                  const isVoided = Boolean(log.voided_at);
                  const isSelected = selectedIds.includes(log.id);
                  return (
                    <tr key={log.id ?? `${log.created_at}-${idx}`} className={`transition-colors ${isVoided ? 'opacity-50 bg-gray-50/50' : isSelected ? 'bg-red-50/40' : 'hover:bg-brand-50/50'}`}>
                      {selectionMode && (
                        <td className="px-3 py-2 text-center">
                          {!isVoided && isVoidableStockEntry(log) && (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelect(log.id)}
                              className="rounded border-brand-300 text-red-600 focus:ring-red-500 cursor-pointer"
                            />
                          )}
                        </td>
                      )}
                      <td className="px-3 py-2 text-[11px] text-brand-600 whitespace-nowrap">{formatDT(log.created_at)}</td>
                      <td className="px-3 py-2">
                        {isVoided ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-[4px] text-[10px] font-bold bg-red-100 text-red-600">Voided</span>
                        ) : (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-[4px] text-[10px] font-bold bg-green-100 text-green-700">{log.action}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-[11px] font-medium text-amber-600 whitespace-nowrap">
                        {log.expiration_date ? new Date(log.expiration_date).toLocaleDateString('en-PH') : '—'}
                      </td>
                      <td className={`px-3 py-2 text-right font-bold text-xs ${isVoided ? 'line-through text-brand-400' : 'text-green-600'}`}>+{log.quantity} {log.unit}</td>
                      <td className="px-3 py-2 text-right text-xs text-brand-600 font-medium">{log.cost > 0 ? `₱${Number(log.cost).toFixed(2)}` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <Pagination page={safePage} total="stock entries" perPage={PAGE_SIZE} count={logs.length} onChange={setPage} />
          </>
        )}
      </div>

      {/* Confirmation Modals */}
      <ConfirmModal
        isOpen={Boolean(confirmLog)}
        onClose={() => setConfirmLog(null)}
        onConfirm={() => runVoid(confirmLog, false)}
        title="Void this stock entry?"
        message={confirmLog ? `This will remove ${confirmLog.quantity} ${confirmLog.unit || ''} recorded as ${confirmLog.action} from the current stock for "${itemName}". The entry will remain in the audit history.` : ''}
        confirmLabel={voidingId ? 'Voiding...' : 'Void entry'}
        variant="danger"
      />

      <ConfirmModal
        isOpen={isBulkConfirmOpen}
        onClose={() => setIsBulkConfirmOpen(false)}
        onConfirm={runBulkVoid}
        title={`Void ${selectedIds.length} selected stock ${selectedIds.length === 1 ? 'entry' : 'entries'}?`}
        message={`This will remove the quantities from the ${selectedIds.length} selected entries from current stock for "${itemName}".`}
        confirmLabel="Void selected"
        variant="danger"
      />

      <ConfirmModal
        isOpen={Boolean(insufficientLog)}
        onClose={() => setInsufficientLog(null)}
        onConfirm={() => runVoid(insufficientLog, true)}
        title="Current stock is insufficient"
        message={`${insufficientDetail} Continue anyway? The stock will be set to zero instead of being reversed exactly.`}
        confirmLabel="Continue anyway"
        variant="danger"
      />
    </div>
  );
}

export { HistoryIcon };

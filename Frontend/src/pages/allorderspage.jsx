import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useToast } from '../components/ui';
import Orders from '../components/allOrders/Orders';
import DetailsModal from '../components/allOrders/DetailsModal';

const SAVE_KEY = 'orders-detail-open';
function loadSaved(locKey) {
  try {
    const s = JSON.parse(sessionStorage.getItem(SAVE_KEY) || 'null');
    return s && s.key === locKey && s.order ? s : null;
  } catch { return null; }
}

export default function AllOrdersPage() {
  const { orders, updateOrderStatus, verifyOrderPayment, loading } = useApp();
  const { show: showToast } = useToast();
  
  const location = useLocation();
  const navigate = useNavigate();

  // Ang bukas na modal ay sine-save sa sessionStorage kasama ang location.key ng history entry.
// Kapag na-remount o na-reload ang page (auto-refresh, iOS Safari reload, atbp.), babalik ang modal.
// Kapag ibang page ang pinuntahan at bumalik via link, bagong location.key na — hindi na ito ibabalik.
const [selectedOrder, setSelectedOrder] = useState(() => loadSaved(location.key)?.order ?? null);
  const [detailOpen, setDetailOpen] = useState(() => !!loadSaved(location.key));

  useEffect(() => {
    try {
      if (detailOpen && selectedOrder) {
        sessionStorage.setItem(SAVE_KEY, JSON.stringify({ key: location.key, order: selectedOrder }));
      } else {
        sessionStorage.removeItem(SAVE_KEY);
      }
    } catch { /* storage unavailable */ }
  }, [detailOpen, selectedOrder, location.key]);

  // laging pinakabagong data ng order ang ipinapakita, pero hindi mawawala ang modal kung saglit na walang laman ang list
  const liveOrder = selectedOrder
    ? (orders || []).find(o => o.id === selectedOrder.id) || selectedOrder
    : null;

  const openOrder = (order) => {
    setSelectedOrder(order);
    setDetailOpen(true);
  };

  useEffect(() => {
    const targetId = location.state?.openOrderId;
    
    // Hintayin mag-load ang orders bago hanapin yung id
    if (targetId && orders && orders.length > 0) {
      const strTarget = String(targetId).replace('ORD-', '');

      const foundOrder = orders.find(o => {
        const oId = String(o.id || '');
        const oNum = String(o.order_number || '').replace('ORD-', '');
        const objId = String(o._id || '');

        return oId === strTarget || oNum === strTarget || objId === strTarget;
      });

      if (foundOrder) {
        openOrder(foundOrder);
        // I-clear ang state agad pagkabukas para hindi mag-loop
        navigate(location.pathname, { replace: true, state: {} });
      }
    }
  }, [location.state, orders, navigate]);

  const handleCloseModal = () => {
    setDetailOpen(false);
  };

  const handleStatusChange = async (id, status) => {
    try {
      await updateOrderStatus(id, status);
      showToast(`Order status updated to ${status}.`);
    } catch (err) {
      showToast(err.message || 'Failed to update status.', 'error');
    }
  };

  const handlePaymentVerification = async (id, accepted) => {
    try {
      await verifyOrderPayment(id, accepted);
      showToast(accepted ? 'Payment accepted.' : 'Payment rejected.');
    } catch (err) {
      showToast(err.message || 'Failed to verify payment.', 'error');
      throw err;
    }
  };

  return (
    <div className="space-y-5">
      <Orders
        orders={orders}
        loading={loading}
        onViewOrder={openOrder}
        onStatusChange={handleStatusChange}
        onPaymentVerification={handlePaymentVerification}
      />
      <DetailsModal
        order={liveOrder}
        isOpen={detailOpen}
        onClose={handleCloseModal}
        onStatusChange={handleStatusChange}
        onPaymentVerification={handlePaymentVerification}
      />
    </div>
  );
}
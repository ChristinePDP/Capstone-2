import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useToast } from '../components/ui';
import Orders from '../components/allOrders/Orders';
import DetailsModal from '../components/allOrders/DetailsModal';

export default function AllOrdersPage() {
  const { orders, updateOrderStatus, loading } = useApp();
  const { show: showToast } = useToast();
  
  const location = useLocation();
  const navigate = useNavigate();

  const [selectedOrder, setSelectedOrder] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);

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

  return (
    <div className="space-y-5">
      <Orders
        orders={orders}
        loading={loading}
        onViewOrder={openOrder}
        onStatusChange={handleStatusChange}
      />
      <DetailsModal
        order={selectedOrder}
        isOpen={detailOpen}
        onClose={handleCloseModal}
        onStatusChange={handleStatusChange}
      />
    </div>
  );
}

import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useToast } from '../components/ui';
import Orders from '../components/allOrders/Orders';
import DetailsModal from '../components/allOrders/DetailsModal';

export default function AllOrdersPage() {
  const { orders, updateOrderStatus, loading } = useApp();
  const { show: showToast } = useToast();

  const [selectedOrder, setSelectedOrder] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const handleStatusChange = async (id, status) => {
    try {
      await updateOrderStatus(id, status);
      showToast(`Order status updated to ${status}.`);
    } catch (err) {
      showToast(err.message || 'Failed to update status.', 'error');
    }
  };

  const openOrder = (order) => {
    setSelectedOrder(order);
    setDetailOpen(true);
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
        onClose={() => setDetailOpen(false)}
        onStatusChange={handleStatusChange}
      />
    </div>
  );
}
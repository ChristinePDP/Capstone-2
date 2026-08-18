// backend/src/services/notification.service.js
import { NotificationsModel } from '../model/notifications.model.js';

export const createNotification = async ({ type, title, message, referenceId, referenceType }) => {
  try {
    return await NotificationsModel.create({ type, title, message, referenceId, referenceType });
  } catch (error) {
    // Notification failure should NEVER break the calling flow (e.g. an order
    // must still succeed even if the notification insert fails), so we log
    // instead of throwing.
    console.error(`[NotificationService] Failed to create notification (${type}):`, error.message);
    return null;
  }
};

export const notifyNewOrder = async (order, payload) => {
  // Keep the title short and consistent (type of order only); push the
  // variable, per-order details (who / how many / how much) into the
  // message line instead of cramming everything into the title.
  return createNotification({
    type: 'new_order',
    title: `New ${payload.orderType} Order`,
    message: `${payload.customer.name} • ${payload.items.length} item(s) • ₱${payload.payment.grandTotal.toLocaleString()}`,
    referenceId: order.id,
    referenceType: 'order'
  });
};

export const getNotifications = async (limit = 50) => {
  return NotificationsModel.findAll({ limit });
};

export const getUnreadNotifications = async () => {
  return NotificationsModel.findUnread();
};

export const markNotificationRead = async (id) => {
  return NotificationsModel.markRead(id);
};

export const markAllNotificationsRead = async () => {
  return NotificationsModel.markAllRead();
};

export const deleteNotification = async (id) => {
  return NotificationsModel.remove(id);
};
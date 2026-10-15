import { supabase } from '../config/supabase.js';

const clients = new Set();
const watchedTables = [
  'raw_ingredients',
  'celebration_materials',
  'products',
  'recipes',
  'recipe_ingredients',
  'production_logs',
  'waste_logs',
  'inventory_logs',
  'orders',
  'order_items',
  'occasions',
  'promo_bundles',
  'bundle_products',
  'notifications',
];
const tablesWithSafeRowPayload = new Set([
  'raw_ingredients',
  'celebration_materials',
  'products',
  'recipes',
  'recipe_ingredients',
  'production_logs',
  'waste_logs',
  'notifications',
  'occasions',
]);

const safeOrderItemFields = ['id', 'order_id', 'product_id', 'bundle_id', 'package_id', 'quantity'];
const safeBundleProductFields = ['id', 'bundle_id', 'product_id', 'quantity'];

let channelStarted = false;

export function addRealtimeClient(res) {
  clients.add(res);
  res.on('close', () => clients.delete(res));

  res.write(`event: ready\ndata: ${JSON.stringify({ connectedAt: new Date().toISOString() })}\n\n`);
}

export function sendRealtimeHeartbeat() {
  for (const client of clients) {
    try {
      client.write(': heartbeat\n\n');
    } catch {
      clients.delete(client);
    }
  }
}

function broadcast(change) {
  const message = `event: data-change\ndata: ${JSON.stringify(change)}\n\n`;
  for (const client of clients) {
    try {
      client.write(message);
    } catch {
      clients.delete(client);
    }
  }
}

export function startRealtimeBridge() {
  if (channelStarted) return;
  channelStarted = true;

  const channel = supabase.channel('cake-app-data-changes');
  for (const table of watchedTables) {
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      payload => {
        const record = payload.eventType === 'DELETE' ? payload.old : payload.new;
        const safeOrderItem = table === 'order_items' && record
          ? Object.fromEntries(safeOrderItemFields.filter(key => record[key] !== undefined).map(key => [key, record[key]]))
          : null;
        const safeBundleProduct = table === 'bundle_products' && record
          ? Object.fromEntries(safeBundleProductFields.filter(key => record[key] !== undefined).map(key => [key, record[key]]))
          : null;
        broadcast({
          table,
          event: payload.eventType,
          recordId: record?.id || null,
          relatedId: record?.order_id || record?.recipe_id || record?.bundle_id || null,
          ...(tablesWithSafeRowPayload.has(table) ? { record } : {}),
          ...(safeOrderItem ? { record: safeOrderItem } : {}),
          ...(safeBundleProduct ? { record: safeBundleProduct } : {}),
          at: new Date().toISOString(),
        });
      }
    );
  }

  channel.subscribe(status => {
    if (status === 'SUBSCRIBED') {
      console.log('[Realtime] Supabase change bridge connected');
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      console.error(`[Realtime] Supabase change bridge status: ${status}`);
    }
  });

  setInterval(sendRealtimeHeartbeat, 25000);
}

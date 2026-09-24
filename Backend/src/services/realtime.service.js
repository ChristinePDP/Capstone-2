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
      payload => broadcast({
        table,
        event: payload.eventType,
        recordId: payload.new?.id || payload.old?.id || null,
        at: new Date().toISOString(),
      })
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

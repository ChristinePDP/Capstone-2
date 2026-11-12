import { supabase, usingServiceRole } from '../config/supabase.js';

const RETENTION_DAYS = 90;
const PAGE_SIZE = 1000;
const DELETE_BATCH_SIZE = 100;
const RETENTION_BUCKETS = [
  { bucket: 'payment-assets', prefix: 'proof_of_transaction' },
  { bucket: 'inspiration-images', prefix: '' },
];

const listObjectsRecursively = async (bucket, prefix = '') => {
  const objects = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(prefix, {
        limit: PAGE_SIZE,
        offset,
        sortBy: { column: 'created_at', order: 'asc' },
      });

    if (error) throw new Error(`Could not list ${bucket}/${prefix}: ${error.message}`);
    if (!data?.length) break;

    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id) {
        objects.push({ path, createdAt: entry.created_at });
      } else {
        objects.push(...await listObjectsRecursively(bucket, path));
      }
    }

    if (data.length < PAGE_SIZE) break;
  }

  return objects;
};

export const cleanExpiredStorageObjects = async ({ now = Date.now() } = {}) => {
  if (!usingServiceRole) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for storage retention cleanup.');
  }

  const cutoff = now - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const summary = [];

  for (const { bucket, prefix } of RETENTION_BUCKETS) {
    const objects = await listObjectsRecursively(bucket, prefix);
    const expired = objects.filter(({ createdAt }) => {
      const createdAtMs = Date.parse(createdAt);
      return Number.isFinite(createdAtMs) && createdAtMs < cutoff;
    });

    let deleted = 0;
    for (let index = 0; index < expired.length; index += DELETE_BATCH_SIZE) {
      const batch = expired.slice(index, index + DELETE_BATCH_SIZE).map(({ path }) => path);
      const { error } = await supabase.storage.from(bucket).remove(batch);
      if (error) {
        console.error(`[STORAGE RETENTION] Failed deleting ${bucket} batch:`, error.message);
        continue;
      }
      deleted += batch.length;
    }

    summary.push({ bucket, scanned: objects.length, expired: expired.length, deleted });
  }

  return summary;
};


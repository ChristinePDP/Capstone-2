// cartImageStore.js
// -----------------------------------------------------------------------------
// Frontend-only IndexedDB storage para sa mga larawan (File objects) na naka-
// attach sa cart — reference image, bundle images, at Multi-image order slip
// fields — para hindi mawala kapag nag-refresh ang page.
//
// Bakit IndexedDB at hindi localStorage: ang File/Blob ay hindi nase-serialize
// ng JSON.stringify (nagiging `{}`), at may ~5MB limit ang localStorage. Ang
// IndexedDB ay kayang mag-store ng File nang direkta (structured clone) at
// mas malaki ang quota.
//
// Paano gumagana:
//  - Ang cart JSON (walang File) ay nasa localStorage pa rin gaya ng dati.
//  - Bawat File sa loob ng cart item ay pinapalitan ng marker
//    `{ __idbFile: "<namespace>:<uuid>" }` at ang aktwal na File ay nasa IndexedDB.
//  - Sa pag-load, pinapalitan ulit ng totoong File ang mga marker.
//
// Walang external dependency. Kapag hindi available ang IndexedDB (hal. ilang
// private mode), tahimik na babalik sa "walang persistence ng larawan" — hindi
// magka-crash ang cart.
// -----------------------------------------------------------------------------

const DB_NAME = 'cakelytics-cart-files';
const STORE = 'files';
const DB_VERSION = 1;
export const FILE_MARKER = '__idbFile';

let dbPromise = null;

function openDb() {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available'));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE);
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        // Kapag may ibang tab na nag-upgrade/nag-delete ng DB, isara ito
        // at buksan ulit sa susunod na gamit.
        db.onversionchange = () => { db.close(); dbPromise = null; };
        resolve(db);
      };
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('IndexedDB open blocked'));
    });
    dbPromise.catch(() => { dbPromise = null; });
  }
  return dbPromise;
}

// Isang transaction, maraming operations. `work(store)` ay tumatanggap ng
// object store at pwedeng magbalik ng IDBRequest para makuha ang result.
async function runTx(mode, work) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    let result;
    const req = work(store);
    if (req && 'onsuccess' in req) req.onsuccess = () => { result = req.result; };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const putFiles = (entries) => {
  if (!entries.length) return Promise.resolve();
  // Naka-wrap ang Blob kasama ang name/type/lastModified para siguradong
  // maibabalik ang eksaktong File (pangalan at uri) sa lahat ng browser.
  return runTx('readwrite', (store) => {
    entries.forEach(([key, file]) => {
      store.put(
        { blob: file, name: file.name || 'image', type: file.type || '', lastModified: file.lastModified || Date.now() },
        key
      );
    });
  });
};

export const deleteFiles = (keys) => {
  if (!keys.length) return Promise.resolve();
  return runTx('readwrite', (store) => {
    keys.forEach((key) => store.delete(key));
  });
};

export const listKeys = (namespace) =>
  runTx('readonly', (store) =>
    store.getAllKeys(IDBKeyRange.bound(`${namespace}:`, `${namespace}:\uffff`))
  ).then((keys) => keys || []);

export async function getFiles(keys) {
  const found = new Map();
  if (!keys.length) return found;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    keys.forEach((key) => {
      const req = store.get(key);
      req.onsuccess = () => {
        const rec = req.result;
        if (rec && rec.blob) {
          found.set(key, new File([rec.blob], rec.name, { type: rec.type, lastModified: rec.lastModified }));
        }
      };
    });
    tx.oncomplete = () => resolve(found);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// ---------------------------------------------------------------------------
// Serialize / revive — nilalakad ang buong cart (nested objects at arrays) kaya
// gumagana ito sa kahit anong lugar kung saan may File: `inspiration_image`,
// `{ [productId]: File }` ng bundle, at `order_slip_details[label]: File[]`.
// ---------------------------------------------------------------------------

const isFile = (v) => typeof Blob !== 'undefined' && v instanceof Blob;
const isMarker = (v) => v !== null && typeof v === 'object' && typeof v[FILE_MARKER] === 'string';

// Para ang parehong File object ay laging may parehong id sa bawat persist
// (hindi na uulit-ulitin ang pag-write sa IndexedDB).
const fileIds = new WeakMap();

export function registerFileId(file, id) {
  fileIds.set(file, id);
}

export function serializeCart(value, namespace, collected = new Map()) {
  if (isFile(value)) {
    let id = fileIds.get(value);
    if (!id) {
      id = `${namespace}:${crypto.randomUUID()}`;
      fileIds.set(value, id);
    }
    collected.set(id, value);
    return { [FILE_MARKER]: id };
  }
  if (Array.isArray(value)) {
    return value.map((v) => serializeCart(v, namespace, collected));
  }
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = serializeCart(v, namespace, collected);
    return out;
  }
  return value;
}

export function collectMarkerIds(value, ids = new Set()) {
  if (isMarker(value)) {
    ids.add(value[FILE_MARKER]);
  } else if (Array.isArray(value)) {
    value.forEach((v) => collectMarkerIds(v, ids));
  } else if (value !== null && typeof value === 'object') {
    Object.values(value).forEach((v) => collectMarkerIds(v, ids));
  }
  return ids;
}

// Ibinabalik ang totoong File kapalit ng marker. Kapag wala na sa IndexedDB
// ang file (na-clear ng browser, atbp.), aalisin ito sa array/object sa halip
// na mag-iwan ng sirang reference.
export function reviveCart(value, files) {
  if (isMarker(value)) {
    const id = value[FILE_MARKER];
    const file = files.get(id);
    if (file) fileIds.set(file, id);
    return file || null;
  }
  if (Array.isArray(value)) {
    const out = [];
    for (const v of value) {
      const revived = reviveCart(v, files);
      if (isMarker(v) && revived === null) continue;
      out.push(revived);
    }
    return out;
  }
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const revived = reviveCart(v, files);
      if (isMarker(v) && revived === null) continue;
      out[k] = revived;
    }
    return out;
  }
  return value;
}
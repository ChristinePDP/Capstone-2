// usePersistedCart.js
// -----------------------------------------------------------------------------
// Drop-in na kapalit ng `const [cart, setCart] = useState([])` (o ng manual
// localStorage sync) para sa cart na may larawan.
//
//   const [cart, setCart, cartReady] = usePersistedCart('pos_cart');
//
//  - Ang cart JSON ay nase-save sa localStorage[storageKey] (kapareho ng
//    dating key, hal. 'pos_cart').
//  - Ang mga File sa loob ng cart ay nase-save sa IndexedDB (cartImageStore.js).
//  - Sa bawat pagbabago ng cart, tinatanggal sa IndexedDB ang mga file na wala
//    na sa cart (na-delete/napalitan/na-checkout na) — kaya kapag na-empty ang
//    cart pagkatapos mag-place ng order, awtomatiko ring nalilinis ang storage.
//  - Ang `cartReady` ay `false` habang hindi pa tapos ang paglo-load mula sa
//    IndexedDB. Hindi magse-save hangga't hindi pa ready para hindi ma-overwrite
//    ng walang laman na cart ang naka-save.
//
// Gumamit ng magkaibang `storageKey` para sa POS at Online Ordering — hiwalay
// din ang namespace ng mga larawan nila sa IndexedDB.
// -----------------------------------------------------------------------------
import { useState, useEffect, useRef } from 'react';
import {
  serializeCart,
  reviveCart,
  collectMarkerIds,
  putFiles,
  getFiles,
  deleteFiles,
  listKeys,
} from './cartImageStore';

export function usePersistedCart(storageKey, initialCart = []) {
  const [cart, setCart] = useState(initialCart);
  const [ready, setReady] = useState(false);

  // Mga id na alam nating nasa IndexedDB na — para hindi ulit i-write ang
  // parehong File sa bawat pagbabago ng cart.
  const storedIds = useRef(new Set());
  // Isa-isang pagtakbo ng sync para hindi mag-overlap ang mga async writes.
  const queue = useRef(Promise.resolve());

  // 1. HYDRATE (isang beses)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      let parsed = null;
      try {
        const raw = localStorage.getItem(storageKey);
        parsed = raw ? JSON.parse(raw) : null;
      } catch (err) {
        console.warn(`[usePersistedCart] Invalid saved cart for "${storageKey}"`, err);
      }

      if (!Array.isArray(parsed)) {
        if (!cancelled) setReady(true);
        return;
      }

      let files = new Map();
      try {
        files = await getFiles([...collectMarkerIds(parsed)]);
      } catch (err) {
        console.warn('[usePersistedCart] Could not read images from IndexedDB', err);
      }

      if (cancelled) return;
      files.forEach((_, id) => storedIds.current.add(id));
      setCart(reviveCart(parsed, files));
      setReady(true);
    })();

    return () => { cancelled = true; };
  }, [storageKey]);

  // 2. PERSIST (sa bawat pagbabago ng cart, pagkatapos ng hydrate)
  useEffect(() => {
    if (!ready) return;

    const collected = new Map();
    try {
      const serialized = serializeCart(cart, storageKey, collected);
      localStorage.setItem(storageKey, JSON.stringify(serialized));
    } catch (err) {
      console.warn('[usePersistedCart] Could not save cart', err);
      return;
    }

    queue.current = queue.current
      .then(async () => {
        const toWrite = [...collected].filter(([id]) => !storedIds.current.has(id));
        await putFiles(toWrite);
        toWrite.forEach(([id]) => storedIds.current.add(id));

        // Linisin ang mga file na wala na sa cart.
        const allKeys = await listKeys(storageKey);
        const orphans = allKeys.filter((key) => !collected.has(key));
        await deleteFiles(orphans);
        orphans.forEach((key) => storedIds.current.delete(key));
      })
      .catch((err) => {
        console.warn('[usePersistedCart] IndexedDB sync failed', err);
      });
  }, [cart, ready, storageKey]);

  return [cart, setCart, ready];
}
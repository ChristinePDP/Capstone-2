import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';

import Home from '../components/onlineOrdering/Home';
import Menu from '../components/onlineOrdering/Menu';
import Checkout from '../components/onlineOrdering/Checkout';
import Confirm from '../components/onlineOrdering/Confirm';
import Header from '../components/onlineOrdering/Header';

const CART_DB_NAME = 'aileen_cake_max_db';
const CART_DB_VERSION = 1;
const CART_STORE_NAME = 'cart_store';
const CART_KEY = 'cart';

// Bakit IndexedDB sa halip na localStorage: kayang-kaya nitong i-store nang
// DIREKTA ang File/Blob objects (walang kailangang i-convert sa base64 text),
// at ang quota nito ay daan-daang MB (kumpara sa ~5-10MB lang ng localStorage)
// — importante dahil hanggang ilang malalaking photo (hal. 3-4 na reference
// picture sa isang Tarpaulin order) ang puwedeng ma-attach sa isang item.
function openCartDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(CART_DB_NAME, CART_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CART_STORE_NAME)) {
        db.createObjectStore(CART_STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadCartFromDb() {
  try {
    const db = await openCartDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(CART_STORE_NAME, 'readonly');
      const req = tx.objectStore(CART_STORE_NAME).get(CART_KEY);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('Failed to read cart from IndexedDB:', err);
    return [];
  }
}

async function saveCartToDb(cart) {
  try {
    const db = await openCartDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(CART_STORE_NAME, 'readwrite');
      tx.objectStore(CART_STORE_NAME).put(cart, CART_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error('Failed to save cart to IndexedDB:', err);
  }
}

export default function OnlineOrderingPage() {
  const [cart, setCart] = useState([]);
  // Naghihintay muna tayo ng buong (async) restore mula sa IndexedDB bago
  // paganahin ang pag-save pabalik — kung hindi, may split-second na
  // ma-o-overwrite natin ang naka-save na cart ng EMPTY array bago pa
  // matapos mag-restore.
  const [cartHydrated, setCartHydrated] = useState(false);

  useEffect(() => {
    (async () => {
      const restored = await loadCartFromDb();
      setCart(restored);
      setCartHydrated(true);
    })();
  }, []);

  useEffect(() => {
    if (!cartHydrated) return;
    saveCartToDb(cart);
  }, [cart, cartHydrated]);

  const [confirmedOrderId, setConfirmedOrderId] = useState('');

  const location = useLocation();
  // '/onlineOrdering/menu' -> 'menu', '/onlineOrdering/checkout' -> 'checkout', atbp.
  const currentPage = location.pathname.split('/').filter(Boolean).pop() || 'home';

  return (
    <>
      {/* Isang beses lang ito nag-mo-mount — mananatili siya habang nagpapalit lang
          ang `page` prop kada navigation, kaya tumatakbo na ang CSS transitions sa
          step indicators sa halip na mag-reset sa bawat page load. */}
      <Header page={currentPage} />

    <Routes>
      {/* Kapag nagpunta sa /onlineOrdering, i-redirect sa /onlineOrdering/home */}
      <Route index element={<Navigate to="/onlineOrdering/home" replace />} />
      
      <Route path="home" element={<Home />} />
      <Route path="menu" element={<Menu cart={cart} setCart={setCart} />} />
      
      <Route path="checkout" element={
        cart.length === 0 
          ? <Navigate to="/onlineOrdering/menu" replace /> 
          : <Checkout cart={cart} setCart={setCart} />
      } />
      
      
      
      <Route path="confirm" element={<Confirm orderId={confirmedOrderId} setCart={setCart} />} />
      
      {/* 404 Fallback sa loob ng ordering page */}
      <Route path="*" element={<Navigate to="/onlineOrdering/home" replace />} />
    </Routes>
    </>
  );
}
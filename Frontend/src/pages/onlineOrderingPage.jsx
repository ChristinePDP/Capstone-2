import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';

import Home from '../components/onlineOrdering/Home';
import Menu from '../components/onlineOrdering/Menu';
import Checkout from '../components/onlineOrdering/Checkout';
import Confirm from '../components/onlineOrdering/Confirm';
import Header from '../components/onlineOrdering/Header';

const CART_STORAGE_KEY = 'aileen_cake_max_cart';

export default function OnlineOrderingPage() {
  // Cart state, naka-persist sa localStorage kaya nananatili ang laman
  // nito kahit mag-refresh o bumalik ang customer gamit ang browser back
  // button. Note: hindi kasama ang `inspiration_image` (File object) sa
  // na-save, dahil hindi ito JSON-serializable — kailangang i-reattach
  // ulit ng customer ang image kapag talagang na-refresh habang naka-set ito.
  const [cart, setCart] = useState(() => {
    try {
      const saved = localStorage.getItem(CART_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (err) {
      console.error('Failed to read cart from storage:', err);
      return [];
    }
  });

  useEffect(() => {
    try {
      const serializable = cart.map(({ inspiration_image, ...rest }) => ({
        ...rest,
        had_inspiration_image: !!inspiration_image,
      }));
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(serializable));
    } catch (err) {
      console.error('Failed to save cart to storage:', err);
    }
  }, [cart]);

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
      
      
      
      <Route path="confirm" element={<Confirm orderId={confirmedOrderId} />} />
      
      {/* 404 Fallback sa loob ng ordering page */}
      <Route path="*" element={<Navigate to="/onlineOrdering/home" replace />} />
    </Routes>
    </>
  );
}
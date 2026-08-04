import { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import Home from '../components/onlineOrdering/Home';
import Menu from '../components/onlineOrdering/Menu';
import Checkout from '../components/onlineOrdering/Checkout';
import Confirm from '../components/onlineOrdering/Confirm';

export default function OnlineOrderingPage() {
  const [cart, setCart] = useState([]);
  const [confirmedOrderId, setConfirmedOrderId] = useState('');

  return (
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
  );
}
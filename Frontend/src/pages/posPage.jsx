import { useState, useEffect, useMemo } from 'react';
import { ShoppingCart } from 'lucide-react';
import PosMenu from '../components/pos/posMenu';
import PosCart from '../components/pos/posCart';
import OrderSlip from '../components/pos/orderSlip';
import { apiClient } from '../services/apiClient'; // <-- BAGONG IMPORT

export default function PosPage() {
  // 1. Initialized mula sa Local Storage
  const [cart, setCart] = useState(() => {
    const savedCart = localStorage.getItem('pos_cart');
    return savedCart ? JSON.parse(savedCart) : [];
  });

  const [orderType, setOrderType] = useState(() => {
    return localStorage.getItem('pos_orderType') || 'Buy Now';
  }); 
  
  const [products, setProducts] = useState([]); 
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [slipModalItem, setSlipModalItem] = useState(null);
  const [loading, setLoading] = useState(true);

  // Bagong State para sa Mobile Drawer Cart
  const [isCartOpen, setIsCartOpen] = useState(false);

  // 2. Syncing Cart at OrderType sa Local Storage tuwing may pagbabago
  useEffect(() => {
    localStorage.setItem('pos_cart', JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    localStorage.setItem('pos_orderType', orderType);
  }, [orderType]);


  // --- FETCH PRODUCTS FROM BACKEND ---
  // Ang `/pos` endpoints ay naka-mount sa ROOT ng API (HINDI sa ilalim ng
  // `/inventory`), kaya absolute URL ang ginagamit dito para ma-bypass ang
  // `/inventory` baseURL ng `apiClient` — parehong pattern gaya ng
  // ORDERS_API_URL sa AppContext.jsx. Cookie-based na ang auth (withCredentials
  // sa apiClient.js), kaya hindi na kailangan ng manual Authorization header.
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true);

        const API_BASE = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || `http://${window.location.hostname}:3000/api`;
        const POS_API_URL = `${API_BASE}/pos/products`;

        const response = await apiClient.get(POS_API_URL);
        const result = response.data; 
        
        if (result.success) {
          const normalized = result.data.map(p => ({
            ...p,
            order_slip_fields: p.order_slip_fields || [],
            pricing_mode: p.pricing_mode || 'fixed',
            price_groups: p.price_groups || [],
            price_matrix: p.price_matrix || []
          }));
          setProducts(normalized);
        }
      } catch (error) {
        console.error('Error fetching POS products:', error);
        alert('Could not load products. Please check your connection.');
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, []);

  const filteredProducts = useMemo(() => {
    return products.filter(p => 
      p.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery, products]);

  // --- UPDATED ADD TO CART LOGIC ---
  const handleAddToCart = (item) => {
    const isCustomizable = (item.order_slip_fields && item.order_slip_fields.length > 0) || item.allow_file_upload || (item.pricing_mode === 'variable' && item.price_matrix?.length > 0);
    
    if (!item.qty && isCustomizable) {
      setSlipModalItem(item);
      return;
    }

    const finalItem = item.qty ? item : {
      ...item,
      qty: 1,
      order_slip_details: null,
      selected_price_options: null,
      inspiration_image: null
    };

    setCart(prev => {
      const currentSlipStr = JSON.stringify(finalItem.order_slip_details);
      const currentOptionsStr = JSON.stringify(finalItem.selected_price_options);
      
      const idx = prev.findIndex(i => 
        i.id === finalItem.id && 
        JSON.stringify(i.order_slip_details) === currentSlipStr &&
        JSON.stringify(i.selected_price_options) === currentOptionsStr
      );

      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { 
          ...next[idx], 
          qty: next[idx].qty + finalItem.qty, 
          inspiration_image: finalItem.inspiration_image || next[idx].inspiration_image 
        };
        return next;
      }
      return [...prev, finalItem];
    });
    
    setSlipModalItem(null); 
  };

  const handleUpdateQty = (index, delta) => {
    setCart(prev => {
      const newCart = [...prev];
      const newQty = newCart[index].qty + delta;
      if (newQty <= 0) return newCart.filter((_, i) => i !== index);
      newCart[index].qty = newQty;
      return newCart;
    });
  };

  const handleClearCart = () => setCart([]);

  return (
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 min-h-[calc(100vh-80px)] lg:h-[calc(100vh-80px)] overflow-x-hidden lg:overflow-hidden w-full max-w-full text-[#3B1F0A] bg-transparent p-3 sm:p-4">
      {/* Binigyan ng pb-24 (padding-bottom) para hindi matakpan ng FAB ang ilalim sa mobile view */}
      <div className="flex-1 flex flex-col min-w-0 h-auto lg:h-full pb-24 lg:pb-0">
         {loading ? (
           <div className="flex-1 flex items-center justify-center font-semibold text-[#8A7264] py-10">Loading products...</div>
         ) : (
           <PosMenu 
            products={filteredProducts}
            activeCategory={activeCategory}
            setActiveCategory={setActiveCategory}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            onAddToCart={handleAddToCart}
          />
         )}
      </div>

      <PosCart 
        cart={cart}
        orderType={orderType}
        setOrderType={setOrderType}
        onUpdateQty={handleUpdateQty}
        onClearCart={handleClearCart}
        isCartOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
      />

      {/* Floating Action Button (FAB) para lang sa Mobile View */}
      <button 
        onClick={() => setIsCartOpen(true)}
        className="fixed bottom-6 right-6 z-[990] lg:hidden bg-[#3B1F0A] text-white p-4 rounded-full shadow-2xl flex items-center gap-3 hover:bg-[#2A1608] transition-transform active:scale-95 border border-[#4A3B36]"
      >
        <div className="relative flex items-center justify-center">
          <ShoppingCart size={24} />
          {cart.length > 0 && (
            <span className="absolute -top-2.5 -right-2.5 bg-red-500 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-[#3B1F0A]">
              {cart.length}
            </span>
          )}
        </div>
        {cart.length > 0 && (
          <span className="font-semibold text-sm">
            ₱{cart.reduce((sum, item) => sum + (item.price * item.qty), 0).toLocaleString()}
          </span>
        )}
      </button>

      {slipModalItem && (
        <OrderSlip 
          product={slipModalItem} 
          onClose={() => setSlipModalItem(null)} 
          onConfirm={handleAddToCart} 
        />
      )}
    </div>
  );
}
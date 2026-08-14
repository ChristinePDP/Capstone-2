import { useState, useEffect, useMemo } from 'react';
import PosMenu from '../components/pos/posMenu';
import PosCart from '../components/pos/posCart';
import OrderSlip from '../components/pos/orderSlip';

export default function PosPage() {
  const [cart, setCart] = useState([]);
  const [products, setProducts] = useState([]); 
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [orderType, setOrderType] = useState('Buy Now'); 
  const [slipModalItem, setSlipModalItem] = useState(null);
  const [loading, setLoading] = useState(true);

  // --- FETCH PRODUCTS FROM BACKEND ---
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('token'); 
        
        const response = await fetch('http://localhost:3000/api/pos/products', {
          credentials: 'include',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (!response.ok) throw new Error('Failed to fetch products');
        const result = await response.json();
        
        if (result.success) {
          // BAGO: Normalization ng data gaya ng nasa Menu.jsx ng Online Ordering
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
    // BAGO: Tamang check base sa database fields imbes na sa lumang 'has_slip'
    const isCustomizable = (item.order_slip_fields && item.order_slip_fields.length > 0) || item.allow_file_upload || (item.pricing_mode === 'variable' && item.price_matrix?.length > 0);
    
    // Kung kiki-click pa lang sa Menu (wala pang qty), i-open ang modal
    if (!item.qty && isCustomizable) {
      setSlipModalItem(item);
      return;
    }

    // Kapag kumpleto na (galing Order Slip o simpleng item lang)
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
    <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-80px)] overflow-hidden text-[#3B1F0A] bg-stone-50 p-4">
      <div className="flex-1 flex flex-col min-w-0 h-full">
         {loading ? (
           <div className="flex-1 flex items-center justify-center font-semibold text-[#8A7264]">Loading products...</div>
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
      />

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
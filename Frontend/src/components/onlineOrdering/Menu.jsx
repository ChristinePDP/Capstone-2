// src/components/onlineOrdering/Menu.jsx
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Minus, X, ShoppingBag, ShoppingCart, ChevronDown, Loader2, Expand, ArrowUp } from 'lucide-react';
import Header from '../onlineOrdering/Header';
import Footer from '../onlineOrdering/Footer';



function ProductModal({ product, onClose, onAddToCart }) {
  const [slipAnswers, setSlipAnswers] = useState({});
  const [imageFile, setImageFile] = useState(null);
  
  const [selectedPriceOptions, setSelectedPriceOptions] = useState({});

  if (!product) return null;

  const hasFields = product.order_slip_fields && product.order_slip_fields.length > 0;
  const isVariable = product.pricing_mode === 'variable' && product.price_groups && product.price_groups.length > 0;

  let resolvedPrice = product.price;
  let allGroupsSelected = true;
  let missingCombo = false;

  if (isVariable) {
    allGroupsSelected = product.price_groups.every(g => selectedPriceOptions[g.name]);
    
    if (allGroupsSelected) {
      const match = product.price_matrix.find(entry => {
        return Object.entries(entry.combo).every(([k, v]) => selectedPriceOptions[k] === v);
      });
      if (match) {
        resolvedPrice = match.price;
      } else {
        missingCombo = true;
      }
    }
  }

  const handleAnswerChange = (label, value) => {
    setSlipAnswers(prev => ({
      ...prev,
      [label]: value
    }));
  };

  const handleAdd = () => {
    if (isVariable) {
      if (!allGroupsSelected) {
        alert(`Please select all options: ${product.price_groups.map(g => g.name).join(', ')}`);
        return;
      }
      if (missingCombo) {
        alert("This specific combination is currently unavailable.");
        return;
      }
    }

    if (hasFields) {
      const missingFields = product.order_slip_fields.filter(field => !slipAnswers[field.label] || slipAnswers[field.label].trim() === '');
      if (missingFields.length > 0) {
        alert(`Mangyaring sagutan ang: ${missingFields.map(f => f.label).join(', ')}`);
        return;
      }
    }

    onAddToCart({ 
      ...product, 
      qty: 1, 
      price: isVariable ? resolvedPrice : product.price,
      selected_price_options: isVariable ? selectedPriceOptions : null,
      order_slip_details: hasFields ? slipAnswers : null,
      inspiration_image: imageFile 
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-[#1F1108]/60 z-[4000] flex items-center justify-center p-4">
      <div className="bg-[#FCFAF9] w-full max-w-[420px] lg:max-w-[620px] rounded-2xl max-h-[90vh] flex flex-col shadow-xl overflow-hidden">

        {/* STICKY HEADER - title/price only, buttons live at the end of the scrollable body */}
        <div className="flex items-start justify-between gap-3 p-4 sm:p-6 bg-white border-b border-[#EAE4E0] shrink-0 z-10">
          <div className="flex-1 min-w-0">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#B7A99F] block mb-1 truncate">{product.category}</span>
            <h2 className="text-xl sm:text-2xl font-serif text-[#3B1F0A] leading-tight mb-1.5 truncate">{product.name}</h2>
            <p className="text-sm font-bold text-[#5A453C]">
              {isVariable ? (allGroupsSelected && !missingCombo ? `₱${Number(resolvedPrice).toLocaleString()}` : 'Select options to see price') : `₱${Number(product.price).toLocaleString()}`}
            </p>
          </div>

          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-[#8A7264] hover:bg-[#F5EFEB] hover:text-[#3B1F0A] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* SCROLLABLE CONTENT BODY - overscroll-contain stops scroll from chaining to the page behind */}
        <div
          className="p-4 sm:p-6 flex-1 overflow-y-auto overscroll-contain scrollbar-thin"
        >

          {isVariable && (
            <div className="flex flex-col gap-4 mb-6">
              <p className="text-[11px] font-bold text-[#5A453C] uppercase tracking-wider">Product Options</p>
              <div className="flex flex-wrap gap-x-4 gap-y-4">
                {product.price_groups.map((group, index) => (
                  <div key={index} className="flex flex-col flex-1 basis-[160px] min-w-[160px]">
                    <label className="text-xs font-semibold text-[#8A7264] mb-1.5">{group.name} *</label>
                    <select
                      className="w-full border border-[#EAE4E0] bg-white p-3 rounded-xl text-sm focus:outline-none focus:border-[#5A453C] transition-colors"
                      value={selectedPriceOptions[group.name] || ''}
                      onChange={e => setSelectedPriceOptions(prev => ({ ...prev, [group.name]: e.target.value }))}
                    >
                      <option value="" disabled>Select {group.name}...</option>
                      {group.options.map((opt, i) => (
                        <option key={i} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              {missingCombo && <p className="text-xs text-red-500 font-semibold mt-2">This combination is unavailable. Please try different options.</p>}
            </div>
          )}

          {hasFields && (
            <div className={`flex flex-col gap-4 mb-6 ${isVariable ? 'border-t border-[#EAE4E0] pt-6' : ''}`}>
              <p className="text-[11px] font-bold text-[#5A453C] uppercase tracking-wider">Customization Details</p>
              <div className="flex flex-wrap gap-x-4 gap-y-4">
                {product.order_slip_fields.map((field, index) => {
                  if (field.type === 'Select') {
                    return (
                      <div key={index} className="flex flex-col flex-1 basis-[160px] min-w-[160px]">
                        <label className="text-xs font-semibold text-[#8A7264] mb-1.5">{field.label}</label>
                        <select className="w-full border border-[#EAE4E0] bg-white p-3 rounded-xl text-sm focus:outline-none focus:border-[#5A453C] transition-colors" onChange={e => handleAnswerChange(field.label, e.target.value)} defaultValue="">
                          <option value="" disabled>Select {field.label}...</option>
                          {field.options?.map((opt, i) => (
                            <option key={i} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </div>
                    );
                  }
                  if (field.type === 'Textarea') {
                    return (
                      <div key={index} className="flex flex-col w-full basis-full">
                        <label className="text-xs font-semibold text-[#8A7264] mb-1.5">{field.label}</label>
                        <textarea placeholder={`Enter ${field.label}...`} className="w-full border border-[#EAE4E0] bg-white p-3 rounded-xl text-sm focus:outline-none focus:border-[#5A453C] resize-none transition-colors" rows={3} onChange={e => handleAnswerChange(field.label, e.target.value)} />
                      </div>
                    );
                  }
                  return (
                    <div key={index} className="flex flex-col flex-1 basis-[160px] min-w-[160px]">
                      <label className="text-xs font-semibold text-[#8A7264] mb-1.5">{field.label}</label>
                      <input type={field.type === 'Number' ? 'number' : 'text'} placeholder={`Enter ${field.label}...`} className="w-full border border-[#EAE4E0] bg-white p-3 rounded-xl text-sm focus:outline-none focus:border-[#5A453C] transition-colors" onChange={e => handleAnswerChange(field.label, e.target.value)} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {product.allow_file_upload && (
            <div className={`mb-2 ${isVariable || hasFields ? 'border-t border-[#EAE4E0] pt-6' : ''}`}>
              <label className="text-xs font-semibold text-[#8A7264] mb-1.5 block">Upload Reference Image (Optional)</label>

              {!imageFile ? (
                <label className="flex items-center w-full border border-[#EAE4E0] bg-[#F5EFEB] p-2 text-xs rounded-xl cursor-pointer focus-within:border-[#5A453C] transition-colors">
                  <span className="mr-3 py-1 px-3 rounded-lg border-0 text-[10px] font-bold uppercase bg-white text-[#4A3B36] shrink-0">Choose File</span>
                  <span className="text-[#8A7264] truncate">No file chosen</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                </label>
              ) : (
                <div className="flex items-center justify-between w-full border border-[#EAE4E0] bg-[#F5EFEB] p-2 pl-3 rounded-xl">
                  <span className="text-xs text-[#4A3B36] truncate min-w-0 flex-1">{imageFile.name}</span>
                  <button
                    type="button"
                    onClick={() => setImageFile(null)}
                    aria-label="Remove file"
                    className="ml-3 w-6 h-6 rounded-full bg-white text-[#8A7264] flex items-center justify-center shrink-0 hover:bg-[#EAE4E0] hover:text-[#3B1F0A] transition-colors"
                  >
                    <X size={13} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* BUTTONS - part of the scrollable body itself, right after the fields (not a sticky footer) */}
          <div className={`flex flex-col sm:flex-row-reverse gap-2 ${product.allow_file_upload || isVariable || hasFields ? 'mt-6 pt-6 border-t border-[#EAE4E0]' : ''}`}>
            <button
              onClick={handleAdd}
              disabled={isVariable && missingCombo}
              className={`flex-1 px-4 py-3 rounded-xl text-xs font-bold transition-colors shadow-sm ${isVariable && missingCombo ? 'bg-[#EAE4E0] text-[#8A7264] cursor-not-allowed' : 'bg-[#3B1F0A] text-white hover:bg-[#2A1608]'}`}
            >
              Add to Cart
            </button>
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 border border-[#DED4CC] rounded-xl text-xs font-bold text-[#5A453C] hover:bg-[#F5EFEB] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ImagePreviewModal({ product, onClose }) {
  if (!product) return null;
  return (
    <div className="fixed inset-0 bg-[#1F1108]/80 backdrop-blur-md z-[5000] flex items-center justify-center p-4 sm:p-8 animate-in fade-in duration-200" onClick={onClose}>
      <div className="relative w-full max-w-2xl flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute -top-4 -right-2 sm:-top-3 sm:-right-3 w-9 h-9 rounded-full bg-white text-[#3B1F0A] flex items-center justify-center shadow-lg hover:bg-[#F5EFEB] active:scale-95 transition-all z-10"><X size={18} /></button>
        <div className="p-2 sm:p-3 bg-gradient-to-br from-[#EFE0C8] via-[#FCFAF9] to-[#DDC3A0] rounded-[22px] shadow-2xl w-full">
          <div className="rounded-2xl border border-[#3B1F0A]/25 p-1">
            <img src={product.image_url} alt={product.name} className="w-full max-h-[65vh] sm:max-h-[70vh] object-contain rounded-[14px] bg-[#F5EFEB]" />
          </div>
        </div>
        <div className="mt-4 text-center px-4">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#DCCBBA]">{product.category}</span>
          <h3 className="text-lg sm:text-xl font-serif text-white mt-1">{product.name}</h3>
        </div>
      </div>
    </div>
  );
}

export default function Menu({ cart, setCart }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('All');
  const [modal, setModal] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const productListRef = useRef(null);

  const BACK_TO_TOP_THRESHOLD = 400;

  // Tracks scroll position from both possible scroll sources: the window
  // (mobile, where the whole page scrolls) and the internal product list
  // container (desktop, where only that panel scrolls).
  const checkScrollPosition = () => {
    const windowScrollY = window.scrollY || document.documentElement.scrollTop;
    const listScrollY = productListRef.current ? productListRef.current.scrollTop : 0;
    setShowBackToTop(windowScrollY > BACK_TO_TOP_THRESHOLD || listScrollY > BACK_TO_TOP_THRESHOLD);
  };

  useEffect(() => {
    window.addEventListener('scroll', checkScrollPosition, { passive: true });
    return () => window.removeEventListener('scroll', checkScrollPosition);
  }, []);

  const handleBackToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    productListRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const CATEGORY_ORDER = ['Package', 'Cake', 'Pastry', 'Celebration Material'];

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`${import.meta.env.VITE_API_URL}/online-ordering/products`);
        const json = await response.json();
        if (json.success) {
          const normalized = json.data.map(p => ({
            ...p,
            order_slip_fields: p.order_slip_fields || [],
            pricing_mode: p.pricing_mode || 'fixed',
            price_groups: p.price_groups || [],
            price_matrix: p.price_matrix || []
          }));
          setProducts(normalized);
        }
      } catch (error) {
        console.error("Failed to fetch products:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchProducts();
  }, []);

  const addToCart = (item) => {
    setCart(prev => {
      const currentSlipStr = JSON.stringify(item.order_slip_details);
      const currentOptionsStr = JSON.stringify(item.selected_price_options);
      
      const idx = prev.findIndex(i => 
        i.id === item.id && 
        JSON.stringify(i.order_slip_details) === currentSlipStr &&
        JSON.stringify(i.selected_price_options) === currentOptionsStr
      );

      const currentQtyInCart = prev.filter(i => i.id === item.id).reduce((s, i) => s + i.qty, 0);

      // FIX: same gap as the sold-out badge — 'Both' items are buyable right
      // now too, so cart quantity must respect their stock limit as well, not
      // just strict 'Pick-up Today' items.
      if (item.order_type === 'Pick-up Today' || item.order_type === 'Both') {
        const limit = item.available_stock ?? 0;
        if (currentQtyInCart + item.qty > limit) {
          alert(`Sorry, hanggang ${limit} slots na lang ang available para sa ${item.name}.`);
          return prev;
        }
      }

      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + item.qty, inspiration_image: item.inspiration_image || next[idx].inspiration_image };
        return next;
      }
      return [...prev, item];
    });
  };

  const changeQty = (index, delta) => setCart(prev => {
    const newCart = [...prev];
    const item = newCart[index];
    const newQty = item.qty + delta;

    if ((item.order_type === 'Pick-up Today' || item.order_type === 'Both') && delta > 0) {
      const currentQtyInCart = prev.filter(i => i.id === item.id).reduce((s, i) => s + i.qty, 0);
      const limit = item.available_stock ?? 0;
      if (currentQtyInCart + delta > limit) {
        alert(`Limit reached: ${limit} slots lang ang available.`);
        return prev;
      }
    }

    if (newQty <= 0) return prev.filter((_, i) => i !== index);
    newCart[index] = { ...item, qty: newQty };
    return newCart;
  });

  const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  useEffect(() => {
    if (cartCount === 0) setIsMobileCartOpen(false);
  }, [cartCount]);

  // Kagaya ng renderProductGrid() sa posMenu.jsx: kapag "All" ang tab, hinahati
  // ang mga products sa per-category sections (may header + item count), sa
  // pagkakasunod-sunod ng CATEGORY_ORDER — hindi lang basta flat na list.
  // Kapag may specific category naman na naka-select, iisang section lang ang
  // lalabas pero ganun pa rin ang layout, kapareho ng ginagawa sa POS.
  const renderProductGrid = () => {
    const categoriesToRender = activeTab === 'All' ? CATEGORY_ORDER : [activeTab];

    return categoriesToRender.map(cat => {
      const catProducts = products.filter(p => p.category === cat);
      if (catProducts.length === 0) return null;

      return (
        <div key={cat} className="mb-8">
          <div className="flex items-center justify-between mb-4 border-b border-[#EAE4E0] pb-2.5">
            <h3 className="font-mono text-xs uppercase tracking-[0.2em] text-[#8A7264] font-bold">{cat}</h3>
            <span className="text-[11px] text-[#B7A99F]">{catProducts.length} items</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 lg:gap-4">
            {catProducts.map(p => {

              // FIX (same as posMenu.jsx): products with order_type 'Both' are still
              // buyable right now, so they must be stock-checked too — not just strict
              // 'Pick-up Today' items. Previously 'Both' products never got flagged sold
              // out even at 0 stock.
              const isStockTracked = p.order_type === 'Pick-up Today' || p.order_type === 'Both';

              // 'Both' items can optionally run off a daily_limit (e.g. pastries baked
              // to order, not tied to a physical inventory count) instead of
              // stock_quantity. If daily_limit is set, that's the basis; otherwise fall
              // back to stock_quantity like a normal Pick-up Today item. A product with
              // neither value set correctly resolves to 0 → sold out.
              const hasDailyLimit = p.order_type === 'Both' && p.daily_limit != null && p.daily_limit > 0;
              const stockBasis = hasDailyLimit ? p.daily_limit : p.stock_quantity;
              const currentStock = p.available_stock ?? stockBasis ?? 0;
              const isSoldOut = isStockTracked && currentStock <= 0;

              const isVariable = p.pricing_mode === 'variable' && p.price_matrix?.length > 0;
              const minPrice = isVariable ? Math.min(...p.price_matrix.map(m => m.price)) : p.price;

              return (
                <div key={p.id} className="bg-white rounded-2xl border border-[#EAE4E0] overflow-hidden flex flex-col group shadow-sm relative">
                  <div className="relative aspect-[4/3] overflow-hidden bg-[#F5EFEB] shrink-0">
                    <img src={p.image_url} alt={p.name} className="w-full h-full object-cover transition-all duration-300 group-hover:scale-105 group-hover:blur-[3px] group-hover:brightness-[0.55]" />

                    {isStockTracked && (
                      <div className={`absolute top-2 left-2 px-2.5 py-1 rounded-md shadow-sm border border-white/20 z-10 backdrop-blur-sm ${isSoldOut ? 'bg-red-500/90 text-white' : 'bg-white/90 text-[#3B1F0A]'}`}>
                        <span className="text-[10px] font-bold uppercase tracking-wider">
                          {isSoldOut ? 'Sold Out' : `${currentStock} Available`}
                        </span>
                      </div>
                    )}

                    <button type="button" onClick={() => setPreviewImage(p)} aria-label={`See full image of ${p.name}`} className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 cursor-pointer z-0">
                      <span className="flex items-center gap-1.5 text-white text-[10px] sm:text-[11px] font-semibold uppercase tracking-wide bg-[#1F1108]/40 backdrop-blur-sm px-3 py-1.5 rounded-full border border-white/30"><Expand size={12} /> See this image</span>
                    </button>
                  </div>
                  <div className="p-3 sm:p-4 lg:p-3 flex flex-col flex-1">
                    <span className="font-mono text-[8px] sm:text-[9px] uppercase tracking-[0.15em] text-[#B7A99F] mb-1">{p.category}</span>
                    <h3 className="font-bold text-xs sm:text-sm lg:text-xs text-[#3B1F0A] mb-1.5 lg:mb-1.5 leading-snug flex-1 line-clamp-2 min-h-[2rem] sm:min-h-[2.5rem] lg:min-h-[2.25rem]">{p.name}</h3>
                    <p className="text-xs sm:text-sm lg:text-xs font-bold text-[#5A453C] mb-2 lg:mb-2">
                       {isVariable ? 'Starting at ' : ''}₱{Number(minPrice).toLocaleString()}
                    </p>

                    <button
                      onClick={() => {
                        if (isSoldOut) return;
                        (isVariable || (p.order_slip_fields && p.order_slip_fields.length > 0) || p.allow_file_upload) ? setModal(p) : addToCart({ ...p, qty: 1, order_slip_details: null, selected_price_options: null });
                      }}
                      disabled={isSoldOut}
                      className={`w-full py-2 sm:py-2.5 lg:py-2 rounded-full text-[11px] sm:text-xs font-semibold transition-colors ${
                        isSoldOut 
                          ? 'bg-[#EAE4E0] text-[#8A7264] cursor-not-allowed' 
                          : 'bg-[#3B1F0A] text-white hover:bg-[#2A1608]'
                      }`}
                    >
                      {isSoldOut ? 'Out of Stock' : (isVariable ? 'Select Options' : 'Add to Cart')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    });
  };

  return (
    <div className="bg-[#FCFAF9] min-h-screen flex flex-col relative">
      <Header page="menu" />

      <div className="flex-1 w-full max-w-[1440px] mx-auto flex flex-col lg:flex-row gap-8 lg:gap-10 px-4 sm:px-8 py-4 lg:py-4 lg:pl-[140px] xl:pl-[160px]">
        
        <div className="relative flex-1 flex flex-col lg:h-[calc(100vh-112px)] min-h-0 lg:border-l lg:border-[#EAE4E0] lg:pl-6">
          <div className="hidden sm:flex gap-2 flex-wrap mb-4 shrink-0">
            {['All', ...CATEGORY_ORDER].map(cat => (
              <button key={cat} onClick={() => setActiveTab(cat)} className={`px-5 py-2.5 rounded-full text-xs font-semibold tracking-wide transition-colors ${activeTab === cat ? 'bg-[#3B1F0A] text-white' : 'bg-[#F5EFEB] text-[#8A7264] hover:bg-[#EAE4E0]'}`}>
                {cat}
              </button>
            ))}
          </div>

          <div className="block sm:hidden mb-3 w-full relative shrink-0">
            <select value={activeTab} onChange={(e) => setActiveTab(e.target.value)} className="w-full bg-white border border-[#EAE4E0] text-[#3B1F0A] py-2.5 px-4 rounded-xl text-sm font-semibold outline-none focus:border-[#5A453C] appearance-none">
              <option value="All">All Categories</option>
              {CATEGORY_ORDER.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8A7264] pointer-events-none" size={16} />
          </div>

          <div ref={productListRef} onScroll={checkScrollPosition} className="flex-1 lg:overflow-y-scroll lg:pr-2 lg:pb-10">
            {isLoading ? (
               <div className="flex justify-center items-center h-40"><Loader2 className="animate-spin text-[#8A7264]" size={32} /></div>
            ) : (
              renderProductGrid()
            )}
          </div>

          {showBackToTop && (
            <button
              onClick={handleBackToTop}
              aria-label="Back to top"
              className="hidden lg:flex absolute bottom-6 right-8 z-30 w-11 h-11 rounded-full bg-[#3B1F0A] text-white items-center justify-center shadow-lg hover:bg-[#2A1608] active:scale-95 transition-all"
            >
              <ArrowUp size={20} />
            </button>
          )}
        </div>

        <div className="hidden lg:flex flex-col w-full lg:w-[360px] shrink-0 bg-white rounded-3xl border border-[#EAE4E0] shadow-sm lg:max-h-[calc(100vh-112px)] overflow-hidden">
          <div className="p-6 pb-4 flex items-center justify-between shrink-0 border-b border-[#F1EBE6]">
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-full bg-[#4A3B36] text-white flex items-center justify-center shrink-0"><ShoppingCart size={16} /></div>
              <h3 className="text-lg font-serif text-[#3B1F0A]">Your Cart</h3>
            </div>
            {cartCount > 0 && <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#8A7264] bg-[#F5EFEB] px-2.5 py-1 rounded-full">{cartCount} item{cartCount > 1 ? 's' : ''}</span>}
          </div>

          {cart.length === 0 ? (
            <div className="p-6 overflow-y-auto">
              <p className="text-sm text-[#B7A99F]">Your cart is empty. Add something from the menu to get started.</p>
            </div>
          ) : (
            <>
              <div className="px-6 py-4 flex-1 overflow-y-auto flex flex-col gap-4">
                {cart.map((item, i) => (
                  <div key={i} className="flex justify-between items-start gap-3 pb-4 border-b border-[#F1EBE6] last:border-0 last:pb-0">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm text-[#3B1F0A] line-clamp-2 leading-snug">{item.name}</p>
                      
                      {item.selected_price_options && Object.entries(item.selected_price_options).map(([key, val]) => (
                        <p key={`opt-${key}`} className="text-[11px] text-[#B7A99F] mt-0.5 leading-snug">{key}: {val}</p>
                      ))}

                      {item.order_slip_details && Object.entries(item.order_slip_details).map(([key, val]) => (
                        <p key={`slip-${key}`} className="text-[11px] text-[#B7A99F] mt-0.5 leading-snug">{key}: {val}</p>
                      ))}

                      {item.inspiration_image && (
                         <p className="text-[11px] font-semibold text-[#8A7264] mt-0.5">Image Attached</p>
                      )}
                      
                      <div className="flex items-center gap-2 mt-2.5">
                        <button onClick={() => changeQty(i, -1)} className="w-6 h-6 rounded-full border border-[#DED4CC] flex items-center justify-center text-[#5A453C] hover:bg-[#EAE4E0]"><Minus size={11} /></button>
                        <span className="font-mono text-xs w-4 text-center">{item.qty}</span>
                        <button onClick={() => changeQty(i, 1)} className="w-6 h-6 rounded-full border border-[#DED4CC] flex items-center justify-center text-[#5A453C] hover:bg-[#EAE4E0]"><Plus size={11} /></button>
                      </div>
                    </div>
                    <span className="font-bold text-sm text-[#5A453C] shrink-0">₱{(item.price * item.qty).toLocaleString()}</span>
                  </div>
                ))}
              </div>

              <div className="px-6 pt-4 pb-6 shrink-0 border-t border-[#F1EBE6] bg-white">
                <div className="flex items-center justify-between mb-5">
                  <span className="text-sm font-semibold text-[#5A453C]">Subtotal</span>
                  <span className="font-serif text-xl text-[#3B1F0A]">₱{cartTotal.toLocaleString()}</span>
                </div>
                <button onClick={() => navigate('/onlineOrdering/checkout')} className="w-full bg-[#3B1F0A] text-white py-3.5 rounded-full text-sm font-semibold hover:bg-[#2A1608] transition-colors">Proceed to Checkout</button>
              </div>
            </>
          )}
        </div>
      </div>

      {cartCount > 0 && !isMobileCartOpen && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-[#EAE4E0] p-4 z-40 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
          <div className="flex gap-3">
            <button onClick={() => setIsMobileCartOpen(true)} className="flex items-center justify-center gap-2 px-5 bg-[#F5EFEB] text-[#3B1F0A] rounded-xl font-semibold shadow-sm shrink-0">
              <div className="relative">
                <ShoppingBag size={18} />
                <span className="absolute -top-1.5 -right-2.5 bg-[#3B1F0A] text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold">{cartCount}</span>
              </div>
            </button>
            <button onClick={() => navigate('/onlineOrdering/checkout')} className="flex-1 bg-[#3B1F0A] text-white py-3.5 rounded-xl text-sm font-semibold shadow-sm flex items-center justify-between px-5">
              <span>Checkout</span>
              <span>₱{cartTotal.toLocaleString()}</span>
            </button>
          </div>
        </div>
      )}

      {isMobileCartOpen && (
        <div className="lg:hidden fixed inset-0 z-[3000] flex justify-center items-end bg-[#1F1108]/60 transition-opacity">
          <div className="bg-white w-full rounded-t-3xl max-h-[85vh] flex flex-col animate-in slide-in-from-bottom-full duration-300">
            <div className="p-5 flex items-center justify-between border-b border-[#EAE4E0]">
              <div>
                <h3 className="text-lg font-serif text-[#3B1F0A]">Your Cart</h3>
                <p className="text-xs text-[#8A7264] mt-0.5">{cartCount} item{cartCount > 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => setIsMobileCartOpen(false)} className="w-8 h-8 rounded-full flex items-center justify-center text-[#8A7264] hover:bg-[#EAE4E0] transition-colors shrink-0"><X size={20} /></button>
            </div>

            <div className="overflow-y-auto p-5 flex flex-col gap-4">
              {cart.map((item, i) => (
                <div key={i} className="flex justify-between items-start gap-3 pb-4 border-b border-[#F1EBE6] last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-sm text-[#3B1F0A] truncate">{item.name}</p>
                    
                    {item.selected_price_options && Object.entries(item.selected_price_options).map(([key, val]) => (
                      <p key={`mob-opt-${key}`} className="text-[11px] text-[#B7A99F] mt-1 leading-snug">{key}: {val}</p>
                    ))}

                    {item.order_slip_details && Object.entries(item.order_slip_details).map(([key, val]) => (
                      <p key={`mob-slip-${key}`} className="text-[11px] text-[#B7A99F] mt-1 leading-snug">{key}: {val}</p>
                    ))}

                    <div className="flex items-center gap-2 mt-3">
                      <button onClick={() => changeQty(i, -1)} className="w-8 h-8 rounded-full border border-[#DED4CC] flex items-center justify-center text-[#5A453C] active:bg-[#EAE4E0]"><Minus size={14} /></button>
                      <span className="font-mono text-sm w-6 text-center">{item.qty}</span>
                      <button onClick={() => changeQty(i, 1)} className="w-8 h-8 rounded-full border border-[#DED4CC] flex items-center justify-center text-[#5A453C] active:bg-[#EAE4E0]"><Plus size={14} /></button>
                    </div>
                  </div>
                  <span className="font-bold text-sm text-[#5A453C] shrink-0 mt-0.5">₱{(item.price * item.qty).toLocaleString()}</span>
                </div>
              ))}
            </div>

            <div className="p-5 border-t border-[#EAE4E0] bg-[#FCFAF9]">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-semibold text-[#5A453C]">Subtotal</span>
                <span className="font-serif text-xl text-[#3B1F0A]">₱{cartTotal.toLocaleString()}</span>
              </div>
              <button onClick={() => { setIsMobileCartOpen(false); navigate('/onlineOrdering/checkout'); }} className="w-full bg-[#3B1F0A] text-white py-3.5 rounded-xl text-sm font-semibold hover:bg-[#2A1608] active:scale-[0.98] transition-all">Proceed to Checkout</button>
            </div>
          </div>
        </div>
      )}

      {showBackToTop && (
        <button
          onClick={handleBackToTop}
          aria-label="Back to top"
          className={`lg:hidden fixed right-4 sm:right-6 z-30 w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-[#3B1F0A] text-white flex items-center justify-center shadow-lg hover:bg-[#2A1608] active:scale-95 transition-all ${
            cartCount > 0 && !isMobileCartOpen ? 'bottom-24' : 'bottom-6'
          }`}
        >
          <ArrowUp size={20} />
        </button>
      )}

      {modal && <ProductModal product={modal} onClose={() => setModal(null)} onAddToCart={addToCart} />}
      {previewImage && <ImagePreviewModal product={previewImage} onClose={() => setPreviewImage(null)} />}
      {cartCount > 0 && <div className="lg:hidden h-24"></div>}
      <Footer />
    </div>
  );
}
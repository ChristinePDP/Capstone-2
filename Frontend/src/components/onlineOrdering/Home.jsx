// src/components/onlineOrdering/Home.jsx
import { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, ArrowRight, ShoppingBasket, Tag, Package, Plus
} from 'lucide-react';
import Header from '../onlineOrdering/Header';
import Footer from '../onlineOrdering/Footer';
import EventAdsModal from '../onlineOrdering/eventAdsModal';

const HERO_FILE = 'heroimg.png';

const STEPS = [
  { n: '01', title: 'Browse the menu', copy: 'Cakes, pastries and celebration packages, all in one place.' },
  { n: '02', title: 'Add to your cart', copy: 'Choose flavors and themes for made-to-order items.' },
  { n: '03', title: 'Confirm details', copy: 'Tell us who it’s for, and when you’d like to pick it up.' },
  { n: '04', title: 'Enjoy', copy: 'Show your digital receipt at the counter and take it home.' },
];

const GALLERY_FILES = [
  'image1.png', 'image2.png', 'image3.png', 'image4.png', 'image5.png',
  'image6.png', 'image7.png', 'image8.png', 'image9.png', 'image10.png',
];

function CreationsCarousel({ items, className = '' }) {
  const trackRef = useRef(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const updateEdges = () => {
    const el = trackRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 4);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
  };

  const scrollByAmount = (dir) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.7, behavior: 'smooth' });
  };

  return (
    <div className={`relative w-full ${className}`}>
      <style>{`.no-scrollbar::-webkit-scrollbar{display:none}.no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}`}</style>

      <button
        onClick={() => scrollByAmount(-1)}
        disabled={atStart}
        aria-label="Previous creations"
        className="flex absolute left-1 sm:-left-2 lg:-left-4 top-1/2 -translate-y-1/2 z-10 w-8 h-8 sm:w-11 sm:h-11 rounded-full bg-[#3B1F0A] text-white items-center justify-center shadow-lg hover:bg-[#2A1608] disabled:opacity-25 disabled:cursor-not-allowed transition-all"
      >
        <ChevronLeft size={16} className="sm:w-[18px] sm:h-[18px]" />
      </button>

      <div
        ref={trackRef}
        onScroll={updateEdges}
        className="no-scrollbar flex gap-3 sm:gap-5 overflow-x-auto scroll-smooth snap-x snap-mandatory px-4 sm:px-1 h-[240px] sm:h-[350px] lg:h-full items-stretch py-2"
      >
        {items.map((src, i) => (
          <div
            key={i}
            className="snap-start shrink-0 w-[140px] sm:w-[220px] lg:w-auto h-full lg:aspect-[3/4.2] bg-white p-1.5 sm:p-2 rounded-t-[999px] rounded-b-2xl border border-[#DED4CC] shadow-sm"
          >
            <div className="w-full h-full rounded-t-[999px] rounded-b-xl overflow-hidden">
              <img
                src={src}
                alt={`Past order ${i + 1}`}
                className="w-full h-full object-cover transition-all duration-500 ease-out"
              />
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={() => scrollByAmount(1)}
        disabled={atEnd}
        aria-label="Next creations"
        className="flex absolute right-1 sm:-right-2 lg:-right-4 top-1/2 -translate-y-1/2 z-10 w-8 h-8 sm:w-11 sm:h-11 rounded-full bg-[#3B1F0A] text-white items-center justify-center shadow-lg hover:bg-[#2A1608] disabled:opacity-25 disabled:cursor-not-allowed transition-all"
      >
        <ChevronRight size={16} className="sm:w-[18px] sm:h-[18px]" />
      </button>
    </div>
  );
}

function BundleTicketImage({ products = [], customImageUrl }) {
  if (customImageUrl) {
    return (
      <img
        src={customImageUrl}
        alt="Bundle"
        className="w-full h-full object-cover"
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
      />
    );
  }

  if (products.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Package size={28} className="text-[#DED4CC]" />
      </div>
    );
  }

  const MAX_IMAGE_SLOTS = 3;
  const showCountTile = products.length > MAX_IMAGE_SLOTS;
  const imageSlots = showCountTile ? products.slice(0, MAX_IMAGE_SLOTS - 1) : products;
  const extraCount = products.length - imageSlots.length;
  const segmentCount = imageSlots.length + (showCountTile ? 1 : 0);

  return (
    <div className="relative w-full h-full flex">
      {imageSlots.map((p, idx) => {
        const img = p.image_url || p.image;
        return (
          <div key={p.id ?? idx} className="flex-1 h-full relative overflow-hidden">
            {img ? (
              <img
                src={img}
                alt={p.name}
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-in-out"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            ) : (
              <div className="w-full h-full bg-[#F5EFEB] flex items-center justify-center">
                <Package size={22} className="text-[#DED4CC]" />
              </div>
            )}
          </div>
        );
      })}

      {showCountTile && (
        <div className="flex-1 h-full bg-[#3B1F0A] flex flex-col items-center justify-center text-white">
          <span className="text-lg font-extrabold leading-none">+{extraCount}</span>
          <span className="text-[9px] font-bold uppercase tracking-wide opacity-80">more</span>
        </div>
      )}

      {Array.from({ length: segmentCount - 1 }).map((_, i) => (
        <div
          key={i}
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 w-6 h-6 rounded-full bg-white shadow-md flex items-center justify-center"
          style={{ left: `${(100 / segmentCount) * (i + 1)}%` }}
        >
          <Plus size={13} className="text-[#3B1F0A]" strokeWidth={3} />
        </div>
      ))}
    </div>
  );
}

function BundleTicketCard({ bundle, navigate, idx = 0 }) {
  if (bundle.isLoading) {
    return (
      <div className="snap-start shrink-0 w-[220px] sm:w-[280px] [contain:layout]">
        <div className="bg-white rounded-2xl flex flex-col relative border border-[#F0E9E4] shadow-[0_6px_16px_rgba(59,31,10,0.08)]">
          <div className="p-3 pb-0 animate-pulse">
            <div className="aspect-[4/3] w-full rounded-[14px] bg-[#E8E2DD]"></div>
          </div>
          <div className="relative w-full h-0 my-3">
            <div className="absolute -left-[13px] top-1/2 -translate-y-1/2 w-[26px] h-[26px] rounded-full shadow-[inset_-2px_0_4px_rgba(0,0,0,0.10)] bg-[#FCFAF9]"></div>
            <div className="absolute left-3 right-3 top-0 border-t-2 border-dotted border-[#DED4CC]"></div>
            <div className="absolute -right-[13px] top-1/2 -translate-y-1/2 w-[26px] h-[26px] rounded-full shadow-[inset_2px_0_4px_rgba(0,0,0,0.10)] bg-[#FCFAF9]"></div>
          </div>
          <div className="px-5 pb-6 pt-2 flex flex-col items-center text-center flex-1 animate-pulse">
            <div className="h-2.5 bg-[#E8E2DD] rounded w-1/2 mb-2 mt-1"></div>
            <div className="h-4 bg-[#E8E2DD] rounded w-3/4 mb-4 mt-2"></div>
            <div className="mt-auto flex flex-col items-center w-full justify-end min-h-[36px]">
              <div className="h-8 bg-[#E8E2DD] rounded-full w-24"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isDummy = bundle.isDummy;
  const products = bundle.products || [];
  const originalTotal = Number(bundle.original_total || 0);
  const bundlePrice = Number(bundle.bundle_price || 0);
  const discountPercent = Number(bundle.discount_percent || 0);

  const productNamesList = products.map(p => p.name || 'Item').join(' + ');
  const subTitle = isDummy 
    ? bundle.event_tag 
    : (bundle.event_tag || productNamesList || 'Promo Bundle');

  return (
    <div className="snap-start shrink-0 w-[220px] sm:w-[280px] [contain:layout]">
      <div
        onClick={() => !isDummy && navigate('/onlineOrdering/menu')}
        className={`bg-white rounded-2xl flex flex-col group relative border border-[#F0E9E4] shadow-[0_6px_16px_rgba(59,31,10,0.08)] transition-all duration-300 ease-out hover:-translate-y-2 hover:shadow-xl
          ${isDummy ? 'cursor-default opacity-90' : 'cursor-pointer'}
        `}
      >
        {!isDummy && (
          <div className="absolute -top-3 -right-3 z-20 w-9 h-9 rounded-full bg-[#3B1F0A] border-2 border-white shadow-md flex items-center justify-center rotate-12 group-hover:rotate-0 transition-transform duration-300">
            <ShoppingBasket size={14} className="text-white scale-110" />
          </div>
        )}

        <div className="p-3 pb-0">
          <div className="aspect-[4/3] w-full rounded-[14px] overflow-hidden relative bg-[#F5EFEB]">
            <BundleTicketImage products={products} customImageUrl={bundle.custom_image_url} />

            <div className="absolute top-2 left-2 bg-[#3B1F0A] text-white px-2.5 py-1 rounded-md shadow-md flex items-center gap-1.5">
              <ShoppingBasket size={10} />
              <span className="text-[10px] font-bold uppercase tracking-widest">
                {isDummy ? 'Wait for it' : 'Bundle'}
              </span>
            </div>

            {!isDummy && discountPercent > 0 && (
              <div className="absolute top-2 right-2 bg-[#C0392B] text-white px-2 py-1 rounded-md shadow-md flex items-center gap-1">
                <Tag size={9} />
                <span className="text-[10px] font-bold uppercase tracking-widest">-{discountPercent}%</span>
              </div>
            )}
          </div>
        </div>

        <div className="relative w-full h-0 my-3">
          <div className="absolute -left-[13px] top-1/2 -translate-y-1/2 w-[26px] h-[26px] rounded-full shadow-[inset_-2px_0_4px_rgba(0,0,0,0.10)] bg-[#FCFAF9]"></div>
          <div className="absolute left-3 right-3 top-0 border-t-2 border-dotted border-[#DED4CC]"></div>
          <div className="absolute -right-[13px] top-1/2 -translate-y-1/2 w-[26px] h-[26px] rounded-full shadow-[inset_2px_0_4px_rgba(0,0,0,0.10)] bg-[#FCFAF9]"></div>
        </div>

        <div className="px-5 pb-6 pt-2 flex flex-col items-center text-center flex-1">
          <span 
            className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#8A7264] mb-2 w-full leading-tight"
            title={subTitle}
          >
            {subTitle}
          </span>
          <h3 className={`font-bold text-base sm:text-lg text-[#3B1F0A] leading-snug line-clamp-2 mb-4 w-full transition-colors ${!isDummy && 'group-hover:text-black'}`}>
            {bundle.bundle_name}
          </h3>
          <div className="mt-auto flex flex-col items-center w-full justify-end min-h-[36px]">
            {!isDummy ? (
              <>
                {originalTotal > bundlePrice && (
                  <p className="text-[11px] text-[#B7A99F] line-through mb-0.5">
                    ₱{originalTotal.toLocaleString()}
                  </p>
                )}
                <p className="text-lg sm:text-xl font-black px-4 py-1.5 rounded-full bg-[#F5EFEB] text-[#3B1F0A]">
                  ₱{Number(bundlePrice).toLocaleString()}
                </p>
              </>
            ) : (
              <p className="text-[11px] font-bold uppercase tracking-widest text-[#B7A99F]">
                Coming Soon
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function BundleCarousel({ bundles, isLoading, navigate }) {
  const trackRef = useRef(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);

  let displayBundles = [];
  if (isLoading) {
    displayBundles = [
      { id: 'load-1', isLoading: true },
      { id: 'load-2', isLoading: true }
    ];
  } else if (bundles.length === 0) {
    displayBundles = [
      { id: 'dummy-1', isDummy: true, bundle_name: 'More Bundles Coming Soon!', event_tag: 'Stay Tuned', products: [] },
      { id: 'dummy-2', isDummy: true, bundle_name: 'More Bundles Coming Soon!', event_tag: 'Stay Tuned', products: [] }
    ];
  } else if (bundles.length === 1) {
    displayBundles = [
      ...bundles,
      { id: 'dummy-card', isDummy: true, bundle_name: 'More Bundles Coming Soon!', event_tag: 'Stay Tuned', products: [] }
    ];
  } else {
    displayBundles = bundles;
  }

  const updateEdges = () => {
    const el = trackRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 4);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
    setHasOverflow(el.scrollWidth > el.clientWidth + 4);
  };

  useEffect(() => {
    updateEdges();
    window.addEventListener('resize', updateEdges);
    return () => window.removeEventListener('resize', updateEdges);
  }, [displayBundles]);

  const scrollByAmount = (dir) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  return (
    <div className="relative w-full">
      <button
        onClick={() => scrollByAmount(-1)}
        disabled={atStart}
        aria-label="Previous bundles"
        className="hidden sm:flex absolute -left-3 lg:-left-5 top-[36%] -translate-y-1/2 z-30 w-10 h-10 lg:w-12 lg:h-12 rounded-full bg-[#3B1F0A] text-white items-center justify-center shadow-xl border-2 border-white/70 hover:scale-110 disabled:opacity-0 disabled:pointer-events-none transition-all duration-300"
      >
        <ChevronLeft size={20} />
      </button>

      <div
        ref={trackRef}
        onScroll={updateEdges}
        className={`no-scrollbar flex gap-5 sm:gap-6 overflow-x-auto overscroll-x-contain snap-x snap-proximity scroll-smooth pb-6 pt-6 px-1 ${hasOverflow ? '' : 'justify-center'}`}
      >
        {displayBundles.map((b, idx) => (
          <BundleTicketCard key={b.id} bundle={b} navigate={navigate} idx={idx} />
        ))}
      </div>

      <button
        onClick={() => scrollByAmount(1)}
        disabled={atEnd}
        aria-label="Next bundles"
        className="hidden sm:flex absolute -right-3 lg:-right-5 top-[36%] -translate-y-1/2 z-30 w-10 h-10 lg:w-12 lg:h-12 rounded-full bg-[#3B1F0A] text-white items-center justify-center shadow-xl border-2 border-white/70 hover:scale-110 disabled:opacity-0 disabled:pointer-events-none transition-all duration-300"
      >
        <ChevronRight size={20} />
      </button>

      {hasOverflow && (
        <div className="flex sm:hidden justify-center items-center gap-4 mt-2">
          <button
            onClick={() => scrollByAmount(-1)}
            disabled={atStart}
            aria-label="Previous bundles"
            className="w-9 h-9 rounded-full bg-[#3B1F0A] text-white flex items-center justify-center shadow-md disabled:opacity-30 transition-all"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#8A7264]">Swipe for more</span>
          <button
            onClick={() => scrollByAmount(1)}
            disabled={atEnd}
            aria-label="Next bundles"
            className="w-9 h-9 rounded-full bg-[#3B1F0A] text-white flex items-center justify-center shadow-md disabled:opacity-30 transition-all"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const [storageUrl, setStorageUrl] = useState(null);
  const [configError, setConfigError] = useState(false);
  const [bundles, setBundles] = useState([]);
  const [isLoadingBundles, setIsLoadingBundles] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetch(`${import.meta.env.VITE_API_URL}/online-ordering/config`)
      .then(res => res.json())
      .then(data => {
        if (cancelled) return;
        if (data.success && data.storageUrl) {
          setStorageUrl(data.storageUrl);
        } else {
          setConfigError(true);
        }
      })
      .catch(err => {
        console.error('Failed to load storage config:', err);
        if (!cancelled) setConfigError(true);
      });

    fetch(`${import.meta.env.VITE_API_URL}/online-ordering/products/bundles`)
      .then(res => res.json())
      .then(data => {
        if (cancelled) return;
        if (data.success && Array.isArray(data.data)) {
          setBundles(data.data);
        }
        setIsLoadingBundles(false);
      })
      .catch(err => {
        console.error('Failed to load promo bundles:', err);
        if (!cancelled) setIsLoadingBundles(false);
      });

    return () => { cancelled = true; };
  }, []);

  const imgUrl = (file) => (storageUrl ? `${storageUrl}/${file}` : null);
  const heroImg = imgUrl(HERO_FILE);
  const GALLERY = GALLERY_FILES.map(imgUrl);

  if (!storageUrl && !configError) {
    return (
      <div className="min-h-screen bg-[#FCFAF9] flex items-center justify-center">
        <p className="text-sm text-[#8A7264]">Loading…</p>
      </div>
    );
  }

  const noScrollbarStyle = `
    .no-scrollbar::-webkit-scrollbar { display: none; }
    .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
  `;

  return (
    <div className="min-h-screen bg-[#FCFAF9] text-[#5A453C] font-sans">
      <style>{noScrollbarStyle}</style>
      <EventAdsModal />
      <Header page="home" />
      
      <main>
        {/* 1. Hero Section */}
        <section className="w-full bg-[#FCFAF9] relative overflow-hidden min-h-[calc(100svh-70px)] lg:min-h-0 lg:h-[calc(100vh-76px)] flex items-center py-6 lg:py-0">
          <div className="max-w-[1300px] mx-auto px-5 sm:px-8 w-full relative z-10 lg:translate-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-8 sm:gap-12 lg:gap-16 items-center">
              <div className="w-full mt-2 lg:mt-0">
                <span className="inline-block font-mono text-[9px] sm:text-[10px] uppercase tracking-[0.3em] text-[#8A7264] border border-[#5A453C]/20 rounded-full px-3 py-1 mb-4 sm:mb-6 lg:mb-8">
                  Order Online — Ready for Pickup
                </span>
                <h1 className="text-[32px] leading-[1.1] sm:text-5xl lg:text-6xl xl:text-[68px] font-serif text-[#3B1F0A] mb-4 lg:mb-6 tracking-tight">
                  Elevating everyday moments.
                </h1>
                <p className="text-sm sm:text-lg lg:text-xl text-[#796860] mb-6 sm:mb-8 lg:mb-10 leading-relaxed max-w-lg font-light">
                  Handcrafted cakes and Filipino pastries, baked fresh daily and ready when you are.
                </p>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                  <button
                    onClick={() => navigate('/onlineOrdering/menu')}
                    className="bg-[#3B1F0A] text-white px-6 py-3.5 sm:px-10 sm:py-4 text-xs sm:text-sm uppercase tracking-[0.15em] font-semibold rounded-full hover:bg-[#2A1608] transition-colors w-full sm:w-auto text-center shadow-lg"
                  >
                    Explore Menu
                  </button>
                  <span className="text-xs sm:text-sm text-[#8A7264] text-center sm:text-left">Pickup only — no delivery yet</span>
                </div>
              </div>

              <div className="relative w-full">
                <div className="aspect-[4/3] sm:aspect-square lg:aspect-auto lg:h-[54vh] w-full rounded-2xl sm:rounded-[28px] overflow-hidden shadow-[0_20px_40px_-15px_rgba(59,31,10,0.3)]">
                  <img
                    src={heroImg}
                    alt="Featured artisan cake"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="absolute -bottom-4 -left-2 sm:-bottom-8 sm:-left-8 bg-[#FCFAF9] rounded-xl sm:rounded-2xl px-4 py-3 sm:px-5 sm:py-4 shadow-[0_15px_30px_-10px_rgba(59,31,10,0.25)] border border-[#EAE4E0] max-w-[160px] sm:max-w-[220px]">
                  <p className="font-serif text-lg sm:text-2xl text-[#3B1F0A] leading-none mb-1">Fresh Daily</p>
                  <p className="font-mono text-[9px] sm:text-[10px] uppercase tracking-[0.15em] text-[#B7A99F]">Baked to order</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 2. Promo Bundles Section */}
        <section className="w-full bg-[#F5EFEB] py-10 sm:py-14 relative overflow-hidden border-b border-[#EAE4E0] min-h-[calc(100svh-70px)] lg:min-h-0 lg:h-[calc(100vh-76px)] flex items-center">
          <div className="max-w-[1300px] mx-auto px-5 sm:px-8 w-full relative z-10 flex flex-col lg:flex-row items-center gap-8 lg:gap-12">

            <div className="w-full lg:w-[420px] xl:w-[480px] shrink-0 flex flex-col justify-center text-center lg:text-left">
              <div className="inline-flex items-center justify-center lg:justify-start gap-2 mb-4 lg:mb-6">
                <div className="p-2 rounded-full bg-white/50 backdrop-blur-sm shadow-sm border border-white/40 text-[#3B1F0A]">
                  <ShoppingBasket size={18} className="opacity-80" />
                </div>
                <span className="font-mono text-[9px] sm:text-[10px] uppercase tracking-[0.3em] font-bold text-[#3B1F0A]">
                  Promo Bundles
                </span>
              </div>
              
              <h2 className="text-[32px] leading-[1.1] sm:text-5xl lg:text-6xl xl:text-[68px] font-serif text-[#3B1F0A] mb-4 lg:mb-6 tracking-tight drop-shadow-sm">
                Bundle up & Save.
              </h2>
              
              <p className="text-sm sm:text-lg lg:text-xl text-[#796860] mb-6 sm:mb-8 lg:mb-10 leading-relaxed max-w-lg mx-auto lg:mx-0 font-light">
                Mix and match our favorites — save more when you order them together.
              </p>
              
              <button
                onClick={() => navigate('/onlineOrdering/menu')}
                className="inline-flex items-center justify-center lg:justify-start gap-2 text-[#3B1F0A] font-bold text-xs sm:text-sm hover:opacity-70 transition-opacity uppercase tracking-widest group"
              >
                View full menu
                <span className="bg-white/80 backdrop-blur-sm p-1.5 rounded-full shadow-sm group-hover:translate-x-1 transition-transform border border-white/50">
                  <ArrowRight size={14} />
                </span>
              </button>
            </div>

            <div className="flex-1 w-full min-w-0">
              <BundleCarousel bundles={bundles} isLoading={isLoadingBundles} navigate={navigate} />
            </div>

          </div>
        </section>

        {/* 3. How to order */}
        <section className="w-full bg-[#FCFAF9] min-h-[calc(100svh-76px)] lg:h-[calc(100vh-76px)] flex flex-col justify-center py-10 sm:py-16">
          <div className="max-w-[1200px] mx-auto px-5 sm:px-8 w-full">
            <div className="text-center mb-10 sm:mb-16 lg:mb-20">
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-serif text-[#3B1F0A]">How to Order</h2>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-10 sm:gap-x-8 sm:gap-y-12 lg:gap-12">
              {STEPS.map((step, idx) => (
                <div key={step.n} className="flex flex-col items-center text-center">
                  <span className="block font-serif text-5xl sm:text-6xl lg:text-[72px] text-[#CDBAB0] mb-3 sm:mb-5 leading-none">
                    {step.n}
                  </span>
                  <h4 className="text-[10px] sm:text-xs lg:text-sm font-bold uppercase tracking-[0.15em] text-[#3B1F0A] mb-2 sm:mb-3">
                    {step.title}
                  </h4>
                  <p className="text-[11px] sm:text-sm text-[#8A7264] leading-relaxed max-w-[180px] sm:max-w-[220px]">
                    {step.copy}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 4. Some Past Creations */}
        <section className="w-full bg-[#F5EFEB] min-h-[420px] sm:min-h-[600px] lg:min-h-0 lg:h-[calc(100vh-76px)] overflow-hidden flex items-center">
          <div className="max-w-[1300px] w-full mx-auto px-2 sm:px-8 py-10 sm:py-16 lg:py-8 h-full flex flex-col justify-center">
            <div className="text-center mb-6 sm:mb-8 lg:mb-6 shrink-0 px-4 sm:px-0">
              <h2 className="text-2xl sm:text-4xl font-serif text-[#3B1F0A] mb-2 sm:mb-3 lg:mb-2">Some Past Creations</h2>
              <p className="text-xs sm:text-base text-[#8A7264] italic">
                A glimpse of the bespoke orders we've crafted for our customers.
              </p>
            </div>

            <div className="lg:flex-1 w-full lg:min-h-0">
              <CreationsCarousel items={GALLERY} className="h-full" />
            </div>
          </div>
        </section>

      </main>
      <Footer />
    </div>
  );
}
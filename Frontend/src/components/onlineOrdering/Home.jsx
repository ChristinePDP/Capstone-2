// src/components/onlineOrdering/Home.jsx
import { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, ArrowRight, ShoppingBasket, Tag, Package, Plus
} from 'lucide-react';
import Footer from '../onlineOrdering/Footer';
import EventAdsModal from '../onlineOrdering/eventAdsModal';

const HERO_FILE = 'heroimg.png';

const STEPS = [
  { n: '01', title: 'Select Items', copy: 'Browse the menu and add your favorite cakes and pastries to the cart.' },
  { n: '02', title: 'Details', copy: 'Tell us who it’s for, and when you’d like to pick it up.' },
  { n: '03', title: 'Payment', copy: 'Choose your payment method and complete your order securely.' },
  { n: '04', title: 'Complete', copy: 'Show your e-receipt at the counter and take it home.' },
];

const GALLERY_FILES = [
  'image1.png', 'image2.png', 'image3.png', 'image4.png', 'image5.png',
  'image6.png', 'image7.png', 'image8.png', 'image9.png', 'image10.png',
];

function CreationsCarousel({ items, className = '' }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const total = items.length;

  const goTo = (idx) => setActiveIndex(((idx % total) + total) % total);
  const prev = () => goTo(activeIndex - 1);
  const next = () => goTo(activeIndex + 1);

  return (
    <div className={`relative w-full flex items-center justify-center ${className}`}>
      <button
        onClick={prev}
        aria-label="Previous creations"
        className="flex absolute left-0 sm:left-1 lg:left-2 top-1/2 -translate-y-1/2 z-30 w-7 h-7 sm:w-11 sm:h-11 rounded-full bg-[#3B1F0A] text-white items-center justify-center shadow-lg hover:bg-[#2A1608] transition-all"
      >
        <ChevronLeft size={14} className="sm:w-[18px] sm:h-[18px]" />
      </button>

      <div className="relative w-full h-full flex items-center justify-center overflow-hidden px-8 sm:px-12 lg:px-14 py-5 sm:py-7 lg:py-9">
        {items.map((src, i) => {
          let offset = i - activeIndex;
          if (offset > total / 2) offset -= total;
          if (offset < -total / 2) offset += total;

          const abs = Math.abs(offset);
          if (abs > 2) return null;

          const isActive = offset === 0;
          const translatePct = offset * 58;
          const scale = isActive ? 1 : abs === 1 ? 0.78 : 0.62;
          const opacity = isActive ? 1 : abs === 1 ? 0.55 : 0.28;
          const blurPx = isActive ? 0 : abs === 1 ? 2.5 : 5;

          return (
            <div
              key={i}
              onClick={() => !isActive && goTo(i)}
              className={`group absolute w-[110px] sm:w-[195px] lg:w-[220px] h-[150px] sm:h-[250px] lg:h-[285px] transition-all duration-500 ease-out ${abs === 2 ? 'hidden sm:block' : ''} ${isActive ? 'cursor-default' : 'cursor-pointer'}`}
              style={{
                transform: `translateX(${translatePct}%) scale(${scale})`,
                filter: `blur(${blurPx}px)`,
                opacity,
                zIndex: isActive ? 20 : 10 - abs,
              }}
            >
              <div
                className={`w-full h-full bg-white p-1.5 sm:p-2 rounded-t-[999px] rounded-b-2xl border border-[#DED4CC] shadow-md overflow-hidden transition-all duration-300 ${
                  isActive ? 'group-hover:scale-[1.035] group-hover:shadow-2xl group-hover:border-[#D4A87A]' : ''
                }`}
              >
                <div className="w-full h-full rounded-t-[999px] rounded-b-xl overflow-hidden">
                  <img
                    src={src}
                    alt={`Past order ${i + 1}`}
                    className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={next}
        aria-label="Next creations"
        className="flex absolute right-0 sm:right-1 lg:right-2 top-1/2 -translate-y-1/2 z-30 w-7 h-7 sm:w-11 sm:h-11 rounded-full bg-[#3B1F0A] text-white items-center justify-center shadow-lg hover:bg-[#2A1608] transition-all"
      >
        <ChevronRight size={14} className="sm:w-[18px] sm:h-[18px]" />
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

function BundleTicketCard({ bundle, navigate, idx = 0, innerRef, focusStyle, onFocusEnter, onFocusLeave }) {
  if (bundle.isLoading) {
    return (
      <div
        ref={innerRef}
        style={focusStyle}
        className="snap-center shrink-0 w-[220px] sm:w-[280px] [contain:layout] transition-[filter,opacity,transform] duration-300 ease-out"
      >
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
    <div
      ref={innerRef}
      style={focusStyle}
      onMouseEnter={onFocusEnter}
      onMouseLeave={onFocusLeave}
      className="snap-center shrink-0 w-[220px] sm:w-[280px] [contain:layout] transition-[filter,opacity,transform] duration-300 ease-out"
    >
      <div
        onClick={() => !isDummy && navigate('/onlineOrdering/menu', { state: { category: 'Promo Bundle' } })}
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
  const cardRefs = useRef([]);
  const rafRef = useRef(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [focusVals, setFocusVals] = useState([]);
  const [hoveredIdx, setHoveredIdx] = useState(null);

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
    const card = el.querySelector(':scope > *');
    if (!card) return;
    const gap = parseFloat(getComputedStyle(el).columnGap || '0');
    const step = card.getBoundingClientRect().width + gap;
    el.scrollBy({ left: dir * step, behavior: 'smooth' });
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

// ─────────────────────────────────────────────────────────────
// Module-level cache — "nabubuhay" ito habang naka-open ang tab (hindi
// ito React state, kaya HINDI ito nawawala kada mag-unmount/mag-mount
// ulit ang Home, hal. paglipat papunta sa Menu tapos balik). Sa unang
// pagtawag lang dito talaga tatakbo ang fetch; sa susunod na mga pagtawag
// (bagong mount ng Home), ibabalik na lang nito yung parehong promise na
// nasa cache na — kaya isang request lang sa buong buhay ng tab, hindi na
// paulit-ulit kada balik-balik sa Home.
// ─────────────────────────────────────────────────────────────
let configFetchPromise = null;
function getConfig() {
  if (!configFetchPromise) {
    configFetchPromise = fetch(`${import.meta.env.VITE_API_URL}/online-ordering/config`)
      .then(res => res.json())
      .then(data => (data.success && data.storageUrl)
        ? { storageUrl: data.storageUrl, configError: false }
        : { storageUrl: null, configError: true })
      .catch(err => {
        console.error('Failed to load storage config:', err);
        return { storageUrl: null, configError: true };
      });
  }
  return configFetchPromise;
}

let bundlesFetchPromise = null;
function getBundles() {
  if (!bundlesFetchPromise) {
    bundlesFetchPromise = fetch(`${import.meta.env.VITE_API_URL}/online-ordering/products/bundles`)
      .then(res => res.json())
      .then(data => (data.success && Array.isArray(data.data)) ? data.data : [])
      .catch(err => {
        console.error('Failed to load promo bundles:', err);
        return [];
      });
  }
  return bundlesFetchPromise;
}

export default function Home() {
  const navigate = useNavigate();
  const [storageUrl, setStorageUrl] = useState(null);
  const [configError, setConfigError] = useState(false);
  const [bundles, setBundles] = useState([]);
  const [isLoadingBundles, setIsLoadingBundles] = useState(true);

  useEffect(() => {
    let cancelled = false;

    getConfig().then(result => {
      if (cancelled) return;
      setStorageUrl(result.storageUrl);
      setConfigError(result.configError);
    });

    getBundles().then(result => {
      if (cancelled) return;
      setBundles(result);
      setIsLoadingBundles(false);
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

      <main>
        {/* 1. Hero Section */}
        <section className="w-full bg-[#FCFAF9] relative overflow-hidden min-h-[calc(100svh-70px)] lg:min-h-0 lg:h-[calc(100vh-76px)] flex items-center py-6 lg:py-0">
          <div className="max-w-[1300px] mx-auto px-5 sm:px-8 lg:px-16 w-full relative z-10 lg:-translate-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_0.92fr] gap-10 sm:gap-14 lg:gap-10 items-center">
              <div className="w-full mt-2 lg:mt-0 relative z-20 text-center lg:text-left">
                <span className="inline-flex items-center gap-2 -rotate-2 border border-dashed border-[#3B1F0A]/25 rounded-full px-3.5 py-1.5 mb-5 sm:mb-7 lg:mb-8 bg-[#FCFAF9]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#D4A87A] shrink-0" />
                  <span className="font-serif italic text-[12px] sm:text-sm text-[#5A453C]">
                    a small family bakery, made by hand
                  </span>
                </span>

                <h1 className="text-[32px] leading-[1.15] sm:text-5xl lg:text-[52px] xl:text-[60px] font-serif text-[#3B1F0A] mb-4 lg:mb-6 tracking-tight">
                  Cakes made with love,
                  <br className="hidden sm:block" /> baked <span className="italic text-[#B4813F]">just for you</span>.
                </h1>
                <div className="mt-6 sm:mt-8 lg:mt-10 flex justify-center lg:justify-start">
                  <button
                    onClick={() => navigate('/onlineOrdering/menu')}
                    className="inline-flex items-center gap-3 text-[#3B1F0A] font-bold text-xs sm:text-sm uppercase tracking-[0.15em] hover:opacity-70 transition-opacity group"
                  >
                    See Full Menu
                    <span className="bg-[#3B1F0A] text-white p-2 sm:p-2.5 rounded-full group-hover:translate-x-1 transition-transform shadow-sm">
                      <ArrowRight size={14} />
                    </span>
                  </button>
                </div>
              </div>

              <div className="relative w-full lg:w-[76%] lg:ml-auto mt-6 lg:mt-0">
                <div className="relative aspect-[5/6] sm:aspect-square w-[62%] sm:w-full max-w-[220px] sm:max-w-[420px] mx-auto lg:mx-0 lg:ml-auto rotate-[-2deg]">
                  <div className="absolute inset-0 rounded-[14px] sm:rounded-[20px] overflow-hidden shadow-[0_18px_35px_-16px_rgba(59,31,10,0.4)] sm:shadow-[0_25px_50px_-20px_rgba(59,31,10,0.45)] border-[4px] sm:border-[6px] border-white">
                    <img
                      src={heroImg}
                      alt="A two-tier cake from Aileen Cake Max, freshly finished in the kitchen"
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* washi tape holding the photo down */}
                  <div className="absolute -top-2 sm:-top-3 left-1/2 -translate-x-1/2 -rotate-3 w-9 h-4 sm:w-16 sm:h-7 bg-[#D4A87A]/70 shadow-sm" />
                </div>
              </div>
            </div>
          </div>

          {/* scalloped edge, like a cake board, cutting into the section below */}
          <svg
            className="absolute bottom-0 left-0 w-full h-[16px] sm:h-[24px] text-[#F5EFEB] pointer-events-none"
            preserveAspectRatio="none"
            viewBox="0 0 200 10"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M0,10 L0,4 Q5,10 10,4 Q15,10 20,4 Q25,10 30,4 Q35,10 40,4 Q45,10 50,4 Q55,10 60,4 Q65,10 70,4 Q75,10 80,4 Q85,10 90,4 Q95,10 100,4 Q105,10 110,4 Q115,10 120,4 Q125,10 130,4 Q135,10 140,4 Q145,10 150,4 Q155,10 160,4 Q165,10 170,4 Q175,10 180,4 Q185,10 190,4 Q195,10 200,4 L200,10 Z"
              fill="currentColor"
            />
          </svg>
        </section>

        {/* 2. Promo Bundles Section */}
        <section className="w-full bg-[#F5EFEB] py-10 sm:py-14 relative overflow-hidden border-b border-[#EAE4E0] min-h-[calc(100svh-70px)] lg:min-h-0 lg:h-[calc(100vh-76px)] flex items-center">
          <div className="max-w-[1300px] mx-auto px-5 sm:px-8 w-full relative z-10 flex flex-col lg:flex-row items-center gap-8 lg:gap-12">

            <div className="w-full lg:w-[420px] xl:w-[480px] shrink-0 flex flex-col justify-center text-center lg:text-left">
              <h2 className="text-[32px] leading-[1.1] sm:text-5xl lg:text-6xl xl:text-[68px] font-serif text-[#3B1F0A] mb-4 lg:mb-6 tracking-tight drop-shadow-sm">
                Bundle up & Save.
              </h2>
              
              <p className="text-sm sm:text-lg lg:text-xl text-[#796860] mb-6 sm:mb-8 lg:mb-10 leading-relaxed max-w-lg mx-auto lg:mx-0 font-light">
                Save more when you order them together.
              </p>
              
              <button
                onClick={() => navigate('/onlineOrdering/menu', { state: { category: 'Promo Bundle' } })}
                className="inline-flex items-center justify-center lg:justify-start gap-2 text-[#3B1F0A] font-bold text-xs sm:text-sm hover:opacity-70 transition-opacity uppercase tracking-widest group"
              >
                View promo bundles
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
        <section className="w-full bg-[#F5EFEB] min-h-[380px] sm:min-h-[600px] lg:min-h-0 lg:h-[calc(100vh-76px)] overflow-hidden flex items-center">
          <div className="max-w-[1300px] w-full mx-auto px-1 sm:px-8 py-8 sm:py-16 lg:py-8 h-full flex flex-col justify-center">
            <div className="text-center mb-5 sm:mb-8 lg:mb-6 shrink-0 px-4 sm:px-0">
              <h2 className="text-xl sm:text-4xl font-serif text-[#3B1F0A] mb-2 sm:mb-3 lg:mb-2">Some Past Creations</h2>
              <p className="text-[11px] sm:text-base text-[#8A7264] italic">
                A glimpse of the bespoke orders we've crafted for our customers.
              </p>
            </div>

            <div className="h-[220px] sm:h-auto lg:flex-1 w-full lg:min-h-0">
              <CreationsCarousel items={GALLERY} className="h-full" />
            </div>
          </div>
        </section>

      </main>
      <Footer />
    </div>
  );
}
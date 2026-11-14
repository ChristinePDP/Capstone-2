// src/components/onlineOrdering/eventAdsModal.jsx
//
// Fetches /event-ads on mount. Kung { active: false } o walang data, walang
// ipi-print ang component (null). Kung { active: true, events: [...] },
// lalabas ang modal sa BAWAT fresh mount (hal. bawat pagdating sa Home).
// Kapag na-dismiss ("Maybe next time" / X / backdrop / Escape), mawawala
// lang ito para sa CURRENT visit.
//
// ONE modal para sa 1 hanggang 3 live events:
//  - 1 event  -> buong "hero" design (medallion, title, subtitle, products).
//  - 2-3 events -> WALANG tabs/switching. Lahat ng events ay nakalatag sa
//    iisang vertical scroll (parang App Store rows), kaya hindi na kailangang
//    mag-click ng kahit ano para makita ang lahat (recognition > recall).
//    May "More offers" cue + fade sa ibaba para halatang may kasunod, at
//    laging nakikita ang "Shop Now!" dahil naka-sticky ang footer.
//
// UX rules na sinunod:
//  - Zero-effort discovery: walang nakatagong content sa likod ng tabs.
//  - Primary CTA (Shop Now) laging visible, hindi na napuputol.
//  - Touch targets >= 40-44px (close, CTA, dots, "Maybe next time").
//  - Scroll chaining prevented (overscroll-contain) + naka-lock ang page
//    sa likod habang bukas ang modal.
//  - Focus papunta sa dialog pagbukas; Escape para makasara.
//
// DESIGN NOTE: ONE fixed brand palette (ink/cream) kahit anong occasion;
// ang ICON lang ang nagbabago per event (fallback: Sparkles).

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  X, ArrowRight, ChevronLeft, ChevronRight, ChevronDown, Sparkles, Heart, Gift, Cake, Star,
  Snowflake, Ghost, Flower2, PartyPopper
} from 'lucide-react';

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

const ICON_MAP = {
  heart: Heart, gift: Gift, cake: Cake, star: Star,
  snowflake: Snowflake, ghost: Ghost, flower: Flower2,
  party: PartyPopper, sparkle: Sparkles,
};
const DEFAULT_ICON = Sparkles;

// GENERAL na fallback copy — gumagamit lang ng `event.name`. Hindi kailanman
// blangko ang modal kahit walang title/subtitle/badge mula sa server.
const buildFallbackCopy = (eventName) => {
  const label = eventName || 'This Occasion';
  return {
    badge: 'Limited-Time Deal',
    title: `${label}'s Best Deals`,
    subtitle: 'Handpicked treats for this special occasion — while supplies last.',
  };
};

const formatEventNames = (names, conjunction) => {
  if (names.length < 2) return names[0] || 'This Occasion';
  if (names.length === 2) return names.join(` ${conjunction} `);
  return `${names.slice(0, -1).join(', ')}${conjunction === '&' ? ' &' : ' and'} ${names[names.length - 1]}`;
};

const BRAND = {
  ink: '#3B1F0A',
  muted: '#5A453C',
  faint: '#8A7264',
  cream: '#FFFDF9',
  tint: '#F5EFEB',
  border: '#EAE4E0',
  scrim: '#2A1608',
};

// ─────────────────────────────────────────────────────────────
// Module-level cache — isang beses lang tatawag sa server habang
// naka-open ang tab. Ang `closed` ay local state pa rin kaya lalabas
// ulit ang modal sa bawat fresh mount.
// ─────────────────────────────────────────────────────────────
let eventAdFetchPromise = null;
function getEventAd() {
  if (!eventAdFetchPromise) {
    eventAdFetchPromise = fetch(`${import.meta.env.VITE_API_URL}/online-ordering/products/event-ads`)
      .then((res) => res.json())
      .then((data) => (data.success && data.data?.active && Array.isArray(data.data.events)) ? data.data : null)
      .catch((err) => {
        console.error('Failed to load event ads:', err);
        return null;
      });
  }
  return eventAdFetchPromise;
}

// Kinukuha ang lahat ng ipapakita ng isang event (may fallback sa bawat isa).
const describeEvent = (entry) => {
  const event = entry?.event || {};
  const mergedEvents = Array.isArray(entry?.mergedEvents) && entry.mergedEvents.length
    ? entry.mergedEvents
    : [event];
  const isMerged = mergedEvents.length > 1;
  const names = mergedEvents.map(item => item.name).filter(Boolean);
  const title = isMerged ? `${formatEventNames(names, '&')} Specials` : event.title;
  const subtitle = isMerged
    ? `Check out our specials for ${formatEventNames(names, 'and')}!`
    : event.subtitle;
  const fallback = buildFallbackCopy(event.name);
  return {
    Icon: ICON_MAP[event.icon] || DEFAULT_ICON,
    products: entry?.products || [],
    badge: isMerged ? 'Limited-Time Deals' : event.badge || fallback.badge,
    title: title || fallback.title,
    subtitle: subtitle || fallback.subtitle,
    deadlineLabels: mergedEvents
      .filter(item => item.endMonth && item.endDay)
      .map(item => ({
        key: `${item.name || 'event'}-${item.endMonth}-${item.endDay}`,
        label: isMerged
          ? `${item.name} · Until ${MONTH_NAMES[item.endMonth - 1]} ${item.endDay}`
          : `Until ${MONTH_NAMES[item.endMonth - 1]} ${item.endDay}`,
      })),
    isMerged,
  };
};

// ─────────────────────────────────────────────────────────────
// ProductStrip — horizontal na listahan ng products ng ISANG event.
// May sarili itong scroll position/dots, kaya pwedeng maraming strip
// sa iisang modal (isa kada event) nang hindi nag-aaway ang state.
// Swipe (touch) + arrow buttons (desktop) ang paraan ng pag-scroll.
// ─────────────────────────────────────────────────────────────
function ProductStrip({ products, Icon, onProductClick }) {
  const trackRef = useRef(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const visible = products.slice(0, 8);

  const getStep = () => {
    const el = trackRef.current;
    if (!el || !el.firstElementChild) return 0;
    return el.firstElementChild.getBoundingClientRect().width
      + (parseFloat(getComputedStyle(el).columnGap) || 0);
  };

  const scrollTrack = (direction) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  const handleTrackScroll = () => {
    const el = trackRef.current;
    const step = getStep();
    if (el && step > 0) setActiveIdx(Math.round(el.scrollLeft / step));
  };

  const scrollToIndex = (i) => {
    const el = trackRef.current;
    const step = getStep();
    if (el && step > 0) el.scrollTo({ left: i * step, behavior: 'smooth' });
  };

  if (visible.length === 0) return null;

  return (
    <div className="relative px-0 sm:px-[52px] md:px-14">
      <div
        ref={trackRef}
        className="event-ads-track flex gap-3 md:gap-4 overflow-x-auto overscroll-x-contain px-4 sm:px-0 scroll-px-4 sm:scroll-px-0 pt-2.5 pb-4 snap-x snap-mandatory scroll-smooth"
        onScroll={handleTrackScroll}
      >
        {visible.map((p) => {
          const isVariable = p.pricing_mode === 'variable' && p.price_matrix?.length > 0;
          const minPrice = isVariable
            ? Math.min(...p.price_matrix.map((m) => m.price))
            : p.price;

          return (
            // Width = (100% - 1 gap) / 2 -> eksaktong DALAWA ang kasya sa unang tingin.
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() => onProductClick(p)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onProductClick(p);
                }
              }}
              aria-label={`View ${p.name} in the menu`}
              className="snap-start shrink-0 w-[calc((100%-12px)/2)] md:w-[calc((100%-16px)/2)] text-left group cursor-pointer"
            >
              <div
                className="relative rounded-2xl overflow-visible border transition-all duration-200 ease-out shadow-[0_2px_8px_-4px_rgba(42,22,8,0.25)] group-hover:-translate-y-0.5 group-hover:border-[#CDBFB5] group-hover:shadow-[0_8px_14px_-8px_rgba(42,22,8,0.3)]"
                style={{ backgroundColor: BRAND.cream, borderColor: BRAND.border }}
              >
                <div
                  className="event-ads-product-image relative aspect-[3/2] w-full flex items-center justify-center overflow-hidden rounded-t-2xl"
                  style={{ backgroundColor: BRAND.tint }}
                >
                  {p.image_url ? (
                    <img
                      src={p.image_url}
                      alt={p.name}
                      className="w-full h-full object-cover transition-none group-hover:scale-100"
                    />
                  ) : (
                    <Icon size={26} style={{ color: BRAND.ink }} className="opacity-30" />
                  )}
                </div>

                {/* Swing price tag */}
                {minPrice != null && (
                  <div
                    className="absolute right-2 -bottom-3 z-10"
                    style={{ transform: 'rotate(-8deg)' }}
                  >
                    <div
                      className="relative flex items-center pl-4 pr-2.5 py-1 shadow-[0_3px_6px_-2px_rgba(42,22,8,0.4)]"
                      style={{
                        backgroundColor: BRAND.ink,
                        clipPath: 'polygon(11px 0%, 100% 0%, 100% 100%, 11px 100%, 0% 50%)'
                      }}
                    >
                      <span
                        className="absolute left-[4px] top-1/2 -translate-y-1/2 w-[4px] h-[4px] rounded-full"
                        style={{ backgroundColor: BRAND.cream }}
                      />
                      <span className="text-[10px] md:text-[11px] font-mono font-bold whitespace-nowrap" style={{ color: BRAND.cream }}>
                        {isVariable ? 'From ' : ''}₱{Number(minPrice).toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}

                <div className="px-3 pt-2.5 pb-1.5">
                  <p className="text-[10px] md:text-[11px] font-bold leading-snug line-clamp-2 min-h-[1.8em]" style={{ color: BRAND.ink }}>
                    {p.name}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Dots (mobile) — malaki ang tap area (h-6) kahit maliit tingnan */}
      {visible.length > 2 && (
        <div className="flex sm:hidden justify-center pb-1">
          {visible.map((p, i) => (
            <button
              key={`dot-${p.id}`}
              type="button"
              onClick={() => scrollToIndex(i)}
              aria-label={`Go to product ${i + 1}`}
              className="h-6 px-[3px] flex items-center"
            >
              <span
                className="block h-1.5 rounded-full transition-all"
                style={{
                  width: i === activeIdx ? 16 : 6,
                  backgroundColor: i === activeIdx ? BRAND.ink : `${BRAND.ink}33`,
                }}
              />
            </button>
          ))}
        </div>
      )}

      {/* Arrows (tablet/desktop) */}
      {visible.length > 2 && (
        <>
          <button
            type="button"
            onClick={() => scrollTrack(-1)}
            aria-label="Previous products"
            className="hidden sm:flex absolute left-2 top-[38%] -translate-y-1/2 w-9 h-9 rounded-full items-center justify-center border-2 shadow-sm bg-white hover:bg-[#F5EFEB] transition-colors z-10"
            style={{ borderColor: BRAND.ink, color: BRAND.ink }}
          >
            <ChevronLeft size={17} strokeWidth={2.5} />
          </button>
          <button
            type="button"
            onClick={() => scrollTrack(1)}
            aria-label="Next products"
            className="hidden sm:flex absolute right-2 top-[38%] -translate-y-1/2 w-9 h-9 rounded-full items-center justify-center border-2 shadow-sm bg-white hover:bg-[#F5EFEB] transition-colors z-10"
            style={{ borderColor: BRAND.ink, color: BRAND.ink }}
          >
            <ChevronRight size={17} strokeWidth={2.5} />
          </button>
        </>
      )}
    </div>
  );
}

export default function EventAdsModal() {
  const navigate = useNavigate();
  const [adData, setAdData] = useState(null);
  const [closed, setClosed] = useState(false);
  const [headerOffset, setHeaderOffset] = useState(76);
  const [canScrollMore, setCanScrollMore] = useState(false);
  const dialogRef = useRef(null);
  const bodyRef = useRef(null);

  const isOpen = !!adData && !closed;

  // Sinusukat ang TUNAY na height ng <header> para laging nasa ibaba nito ang modal.
  useEffect(() => {
    const measure = () => {
      const header = document.querySelector('header');
      if (header) setHeaderOffset(header.getBoundingClientRect().height);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [adData]);

  useEffect(() => {
    let cancelled = false;
    getEventAd().then((data) => {
      if (!cancelled) setAdData(data);
    });
    return () => { cancelled = true; };
  }, []);

  const handleClose = () => {
    setClosed(true);
  };

  const handleShopNow = () => {
    setClosed(true);
    navigate('/onlineOrdering/menu');
  };

  const handleProductClick = (product) => {
    setClosed(true);
    navigate('/onlineOrdering/menu', { state: { focusProductId: product.id } });
  };

  // Hindi gumagalaw ang page sa likod habang bukas ang modal (at walang
  // "jump" ng layout dahil kino-compensate ang nawawalang scrollbar).
  useEffect(() => {
    if (!isOpen) return;
    const { overflow, paddingRight } = document.body.style;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
    };
  }, [isOpen]);

  // Ilipat ang focus sa dialog pagbukas (para sa keyboard/screen reader users).
  useEffect(() => {
    if (isOpen) dialogRef.current?.focus();
  }, [isOpen]);

  // Escape key para makasara
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  // "More offers" cue: lalabas lang kung may content pa sa ibaba ng scroll area.
  const updateScrollHint = () => {
    const el = bodyRef.current;
    if (!el) return;
    setCanScrollMore(el.scrollHeight - el.scrollTop - el.clientHeight > 8);
  };

  useEffect(() => {
    if (!isOpen) return;
    updateScrollHint();
    window.addEventListener('resize', updateScrollHint);
    return () => window.removeEventListener('resize', updateScrollHint);
  }, [isOpen, adData, headerOffset]);

  const scrollBodyDown = () => {
    const el = bodyRef.current;
    if (el) el.scrollBy({ top: el.clientHeight * 0.8, behavior: 'smooth' });
  };

  // ── Lahat ng hooks ay nasa ITAAS nito. Dito lang nagsisimula ang conditional return. ──
  if (!isOpen) return null;

  const events = adData.events || [];
  if (events.length === 0) return null;

  const isMulti = events.length > 1;
  const single = describeEvent(events[0]);
  const HeaderIcon = isMulti ? DEFAULT_ICON : single.Icon;
  const hasBody = isMulti || single.products.length > 0;

  const headerBadge = isMulti ? 'Limited-Time Deals' : single.badge;
  const headerTitle = isMulti ? 'Happening Now' : single.title;
  const headerSubtitle = isMulti
    ? `${events.length} special events are live — scroll to see them all.`
    : single.subtitle;

  return createPortal(
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={headerTitle}
      className="event-ads-dialog fixed left-0 right-0 bottom-0 z-[100] flex items-center justify-center px-4 py-6 sm:py-8 outline-none"
      style={{ top: headerOffset, '--event-ads-header-offset': `${headerOffset}px` }}
    >
      <style>{`
        @keyframes eventTagDrop {
          0% { transform: translateY(-16px) scale(0.94); opacity: 0; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes stampRingSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .event-ads-card, .event-ads-ring { animation: none !important; }
        }
        .event-ads-track::-webkit-scrollbar { display: none; }
        .event-ads-track { -ms-overflow-style: none; scrollbar-width: none; }
        .event-ads-body { scrollbar-width: thin; scrollbar-color: #DED4CC transparent; }
        @media (max-height: 720px) {
          .event-ads-dialog { padding-top: 8px !important; padding-bottom: 8px !important; }
          .event-ads-card {
            margin-top: 20px !important;
            margin-bottom: 0 !important;
            max-height: calc(100dvh - var(--event-ads-header-offset) - 36px) !important;
          }
          .event-ads-header { padding-top: 32px !important; padding-bottom: 6px !important; }
          .event-ads-header-subtitle { display: none !important; }
          .event-ads-product-image { aspect-ratio: 2 / 1 !important; }
          .event-ads-section { padding-top: 8px !important; }
          .event-ads-track { padding-top: 4px !important; padding-bottom: 12px !important; }
          .event-ads-footer { padding-top: 6px !important; padding-bottom: 6px !important; gap: 0 !important; }
          .event-ads-shop-button { min-height: 40px !important; padding-top: 8px !important; padding-bottom: 8px !important; }
          .event-ads-dismiss-button { min-height: 32px !important; }
        }
      `}</style>

      {/* Backdrop */}
      <button
        aria-label="Close"
        onClick={() => handleClose()}
        className="absolute inset-0 backdrop-blur-sm cursor-default"
        style={{ backgroundColor: `${BRAND.scrim}99` }}
      />

      {/* Card */}
      <div
        className="event-ads-card relative w-full max-w-[380px] sm:max-w-[420px] md:max-w-[480px] lg:max-w-[520px] mt-8 mb-4 overflow-visible flex flex-col rounded-[22px] shadow-[0_30px_60px_-15px_rgba(42,22,8,0.45)] border"
        style={{
          backgroundColor: BRAND.cream,
          borderColor: BRAND.border,
          animation: 'eventTagDrop 0.5s ease-out',
          maxHeight: `calc(100dvh - ${headerOffset}px - 64px)`,
        }}
      >
        {/* Close button — 40px para madaling tapikin */}
        <button
          onClick={() => handleClose()}
          aria-label="Close"
          className="absolute top-2 right-2 z-20 w-10 h-10 rounded-full bg-white/85 backdrop-blur-sm border flex items-center justify-center hover:bg-white transition-colors shadow-sm"
          style={{ borderColor: BRAND.border, color: BRAND.muted }}
        >
          <X size={16} />
        </button>

        {/* Stamp medallion — event icon kung 1 event; Sparkles kung marami */}
        <div className="absolute left-1/2 -top-6 -translate-x-1/2 z-10 flex flex-col items-center pointer-events-none">
          <div className="relative w-14 h-14 flex items-center justify-center">
            <div
              className="event-ads-ring absolute inset-0 rounded-full border-2 border-dashed"
              style={{ borderColor: `${BRAND.ink}4D`, animation: 'stampRingSpin 50s linear infinite' }}
            />
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center shadow-[0_8px_16px_-6px_rgba(42,22,8,0.35)] border-[3px]"
              style={{ backgroundColor: BRAND.ink, borderColor: BRAND.cream }}
            >
              <HeaderIcon size={18} className="text-white" strokeWidth={1.75} />
            </div>
          </div>
        </div>

        {/* Column: [header — fixed] / [body — scrolls] / [footer — sticky] */}
        <div className="overflow-hidden flex-1 min-h-0 rounded-[22px] flex flex-col">

          {/* Header */}
          <div
            className="event-ads-header shrink-0 pt-8 pb-3 md:pt-9 md:pb-4 px-12 text-center rounded-t-[22px]"
            style={{
              backgroundColor: BRAND.tint,
              backgroundImage: `radial-gradient(${BRAND.ink}1F 1.4px, transparent 1.4px)`,
              backgroundSize: '15px 15px'
            }}
          >
            <span
              className="inline-block font-mono text-[9px] uppercase tracking-[0.25em] font-bold px-2.5 py-0.5 rounded-full mb-1.5 shadow-sm"
              style={{ color: BRAND.ink, backgroundColor: BRAND.cream }}
            >
              {headerBadge}
            </span>
            <h2 className="font-serif text-[19px] sm:text-[22px] md:text-[25px] leading-[1.15] mb-1 line-clamp-2" style={{ color: BRAND.ink }}>
              {headerTitle}
            </h2>
            <p className="event-ads-header-subtitle text-xs md:text-sm leading-snug max-w-[320px] md:max-w-[440px] mx-auto opacity-90 line-clamp-2" style={{ color: BRAND.muted }}>
              {headerSubtitle}
            </p>
            {!isMulti && single.deadlineLabels.length > 0 && (
              <div className="mt-1.5 flex flex-wrap justify-center gap-1.5">
                {single.deadlineLabels.map(deadline => (
                  <span
                    key={deadline.key}
                    className="font-mono text-[9px] uppercase tracking-[0.12em] px-2.5 py-0.5 rounded-full border border-dashed"
                    style={{ color: BRAND.faint, backgroundColor: `${BRAND.cream}B3`, borderColor: `${BRAND.ink}59` }}
                  >
                    {deadline.label}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Ticket-style tear line */}
          {hasBody && (
            <div className="relative w-full h-0 shrink-0">
              <div className="absolute -left-[13px] top-1/2 -translate-y-1/2 w-[26px] h-[26px] rounded-full shadow-[inset_-2px_0_4px_rgba(0,0,0,0.08)]" style={{ backgroundColor: BRAND.cream }} />
              <div className="absolute left-6 right-6 top-0 border-t-2 border-dotted" style={{ borderColor: BRAND.border }} />
              <div className="absolute -right-[13px] top-1/2 -translate-y-1/2 w-[26px] h-[26px] rounded-full shadow-[inset_2px_0_4px_rgba(0,0,0,0.08)]" style={{ backgroundColor: BRAND.cream }} />
            </div>
          )}

          {/* Body — dito nag-i-scroll (vertical) kapag maraming events */}
          {hasBody && (
            <div className="relative flex-1 min-h-0 flex flex-col">
              <div
                ref={bodyRef}
                onScroll={updateScrollHint}
                className="event-ads-body flex-1 min-h-0 overflow-y-auto overscroll-contain"
              >
                {isMulti ? (
                  events.map((entry, index) => {
                    const view = describeEvent(entry);
                    const SectionIcon = view.Icon;
                    return (
                      <div key={`${entry.event?.id ?? entry.event?.name ?? 'event'}-${index}`}>
                        {index > 0 && (
                          <div className="mx-6 border-t-2 border-dotted" style={{ borderColor: BRAND.border }} />
                        )}
                        <section aria-label={view.title} className="event-ads-section pt-4">
                          {/* Section header: icon + title + subtitle + "Until" */}
                          <div className="flex items-start gap-3 px-4 sm:px-[52px] md:px-14">
                            <div
                              className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center shadow-sm"
                              style={{ backgroundColor: BRAND.ink }}
                            >
                              <SectionIcon size={16} className="text-white" strokeWidth={1.75} />
                            </div>
                            <div className="min-w-0 flex-1">
                              {view.isMerged && (
                                <span
                                  className="inline-block font-mono text-[8px] uppercase tracking-[0.2em] font-bold px-2 py-0.5 rounded-full mb-1 shadow-sm"
                                  style={{ color: BRAND.ink, backgroundColor: BRAND.tint }}
                                >
                                  Limited-Time Deals
                                </span>
                              )}
                              <h3 className="font-serif text-[16px] md:text-[17px] leading-tight line-clamp-2" style={{ color: BRAND.ink }}>
                                {view.title}
                              </h3>
                              <p className="text-[11px] md:text-xs leading-snug mt-0.5 line-clamp-2" style={{ color: BRAND.muted }}>
                                {view.subtitle}
                              </p>
                              {view.deadlineLabels.length > 0 && (
                                <div className="mt-1.5 flex flex-wrap gap-1.5">
                                  {view.deadlineLabels.map(deadline => (
                                    <span
                                      key={deadline.key}
                                      className="font-mono text-[9px] uppercase tracking-[0.12em] px-2.5 py-0.5 rounded-full border border-dashed"
                                      style={{ color: BRAND.faint, backgroundColor: BRAND.tint, borderColor: `${BRAND.ink}59` }}
                                    >
                                      {deadline.label}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>

                          <ProductStrip
                            products={view.products}
                            Icon={view.Icon}
                            onProductClick={handleProductClick}
                          />
                        </section>
                      </div>
                    );
                  })
                ) : (
                  <ProductStrip
                    products={single.products}
                    Icon={single.Icon}
                    onProductClick={handleProductClick}
                  />
                )}
              </div>

              {/* Scroll cue — fade + clickable "More offers" */}
              {isMulti && canScrollMore && (
                <div
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-16 flex items-end justify-center pb-2"
                  style={{ background: `linear-gradient(to top, ${BRAND.cream}, ${BRAND.cream}00)` }}
                >
                  <button
                    type="button"
                    onClick={scrollBodyDown}
                    className="pointer-events-auto inline-flex items-center gap-1 rounded-full border px-3.5 py-1.5 text-[11px] font-bold shadow-md bg-white hover:bg-[#F5EFEB] transition-colors"
                    style={{ borderColor: BRAND.ink, color: BRAND.ink }}
                  >
                    More offers
                    <ChevronDown size={13} strokeWidth={2.5} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Footer — laging nakikita, hindi na napuputol */}
          <div
            className="event-ads-footer shrink-0 px-7 md:px-10 pb-3 md:pb-4 pt-3 flex flex-col items-center gap-0.5"
            style={isMulti ? { borderTop: `1px solid ${BRAND.border}`, backgroundColor: BRAND.cream } : undefined}
          >
            <button
              onClick={handleShopNow}
              className="event-ads-shop-button w-auto min-w-[180px] min-h-[44px] flex items-center justify-center gap-2 text-white font-bold text-xs uppercase tracking-[0.15em] py-3 px-8 rounded-full transition-opacity hover:opacity-90 shadow-md"
              style={{ backgroundColor: BRAND.ink }}
            >
              Shop Now!
              <ArrowRight size={14} />
            </button>
            <button
              onClick={() => handleClose()}
              className="event-ads-dismiss-button min-h-[40px] px-4 text-xs font-semibold transition-colors hover:opacity-80"
              style={{ color: BRAND.faint }}
            >
              Maybe next time
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

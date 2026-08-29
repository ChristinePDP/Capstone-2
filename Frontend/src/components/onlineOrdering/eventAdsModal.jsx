// src/components/onlineOrdering/eventAdsModal.jsx
//
// Fetches /event-ads on mount. Kung { active: false } o walang data pa sa
// cache (analytics_cache -> 'event_ads_homepage'), walang ipi-print ang
// component (null) — hindi lumalabas ang modal. Kung { active: true },
// lalabas ang modal sa BAWAT fresh mount ng component (hal. bawat pagdating
// sa Home) — walang sessionStorage/localStorage na "remember dismissal"
// dito. Kapag na-dismiss ng customer ("Maybe next time" / X / backdrop /
// Escape), mawawala lang ito para sa CURRENT visit; kapag umalis at bumalik
// ang customer sa page (fresh mount), lalabas ulit ito.
//
// DESIGN NOTE (bakit ONE fixed palette na lang, hindi per-event colors):
// Dati, may EVENT_STYLES dictionary na nagbibigay ng magkaibang accent/tint
// kulay per icon key ('heart' = pink, 'snowflake' = blue, atbp). Problema
// dun: finite lang ang listahan ng keys na iyon. Kapag nagdagdag ang owner
// ng bagong occasion na wala talagang tumpak na kulay dun (hal. "Fiesta"),
// mapipilitan lang siyang mag-inherit ng pinakamalapit na "vibe" — hindi
// crash, pero mali/hindi tumpak ang kulay.
//
// Kaya dito, ang kulay/palette ng card ay FIXED na — parehong brand colors
// (ink/cream, kagaya ng ginagamit sa buong site) kahit anong occasion ang
// i-load. Ang ICON na lang ang nagbabago per event, dahil ligtas namang
// mag-fallback ang icon sa isang neutral default (Sparkles) kung hindi
// kilala ang key — walang epekto sa disenyo, icon lang ang mapapalitan.
// Resulta: mas simple, mas kaunting hardcoded branching, at hindi na
// dapat asahan pa na tama ang "guess" ng AI sa kulay ng bawat event.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  X, ArrowRight, ChevronLeft, ChevronRight, Sparkles, Heart, Gift, Cake, Star,
  Snowflake, Ghost, Flower2, PartyPopper
} from 'lucide-react';

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

// Icon lang ang binabago per event — walang kasamang kulay dito. Kung
// magpadala ang backend ng key na wala sa listahan (hal. bagong occasion
// na hindi pa naisip noong ginawa ang listahan), babagsak lang sa
// DEFAULT_ICON sa ibaba. Hindi ito "disenyo per event" — flavor icon lang,
// kaya ligtas at mababa ang risk kahit palaging lumalaki ang listahan ng
// occasions sa Occasion Manager.
const ICON_MAP = {
  heart: Heart, gift: Gift, cake: Cake, star: Star,
  snowflake: Snowflake, ghost: Ghost, flower: Flower2,
  party: PartyPopper, sparkle: Sparkles,
};
const DEFAULT_ICON = Sparkles;

// GENERAL na fallback copy — gumagamit lang ng `event.name` (direktang
// tino-type ng owner sa Occasion Manager, kaya trusted/reliable, hindi
// guess ng AI). Ito ang GUARANTEED na text na lalabas kapag walang
// title/subtitle/badge na dumating mula sa AI — hindi kailanman blangko
// ang modal, at hindi ito naka-tali sa isang partikular na event, kaya
// gagana ito kahit anong occasion pa ang idagdag sa hinaharap.
const buildFallbackCopy = (eventName) => {
  const label = eventName || 'This Occasion';
  return {
    badge: 'Limited-Time Deal',
    title: `${label}'s Best Deals`,
    subtitle: 'Handpicked treats for this special occasion — while supplies last.',
  };
};

// Iisang fixed na brand palette — pareho ito ng ginagamit sa Home.jsx
// (ink CTA buttons, warm cream/tan tints), kaya consistent ang look ng
// buong online ordering flow, hindi lang ng modal na ito.
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
// Module-level cache — hindi React state, kaya nabubuhay ito habang
// naka-open ang tab. Isang beses lang ito talaga tatawag sa server; sa
// mga susunod na mount ng modal na ito (hal. balik-balik sa Home),
// ibabalik na lang ang parehong resulta mula dito — walang bagong
// request. Ang "lalabas ulit ang modal kada balik sa Home" na gawi ay
// nananatili pa rin, dahil local component state pa rin ang `closed`
// (nag-re-reset sa bawat fresh mount) — cached data lang ang hindi na
// paulit-ulit kinukuha.
// ─────────────────────────────────────────────────────────────
let eventAdFetchPromise = null;
function getEventAd() {
  if (!eventAdFetchPromise) {
    eventAdFetchPromise = fetch(`${import.meta.env.VITE_API_URL}/online-ordering/products/event-ads`)
      .then((res) => res.json())
      .then((data) => (data.success && data.data && data.data.active) ? data.data : null)
      .catch((err) => {
        console.error('Failed to load event ads:', err);
        return null;
      });
  }
  return eventAdFetchPromise;
}

export default function EventAdsModal() {
  const navigate = useNavigate();
  const [adData, setAdData] = useState(null);
  const [closed, setClosed] = useState(false);
  const [headerOffset, setHeaderOffset] = useState(76);
  const trackRef = useRef(null);

  // Sinusukat ang TUNAY na height ng <header> (hindi hardcoded number),
  // kaya kahit magbago ang laki nito (mobile hamburger, promo bar, atbp.)
  // hindi na kailangan i-update ang modal. Ang modal region ay
  // nagsisimula LAGI sa ibaba ng header — kaya hindi na natatabunan/
  // "napuputol" ang medallion stamp sa taas ng card ng header. Sinusukat
  // ulit sa resize dahil pwedeng magbago ang header height sa pagitan ng
  // breakpoints (hal. 70px sa mobile -> 76px sa desktop).
  useEffect(() => {
    const measure = () => {
      const header = document.querySelector('header');
      if (header) setHeaderOffset(header.getBoundingClientRect().height);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [adData]);

  // Walang sessionStorage/persistence dito — sadyang in-memory lang ang
  // "closed" state. Ibig sabihin: kapag na-dismiss ("Maybe next time" /
  // X / backdrop / Escape), mawawala ang modal PARA SA CURRENT VISIT na
  // ito lang. Kapag umalis ang customer sa Home (o anumang page kung saan
  // naka-mount ito) at bumalik — fresh mount ulit ito, kaya nag-re-reset
  // ang "closed" state pabalik sa false at lalabas ulit ang modal (kung
  // may live event pa rin base sa bagong fetch).
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

  // "Shop Now!" CTA — static/general na label (hindi mula sa AI/event
  // data), kaya trusted at consistent kahit anong occasion pa ang i-load.
  // Isasara muna ang modal bago mag-navigate, kaya hindi na ito naka-mount
  // sa Menu page pagdating doon.
  const handleShopNow = () => {
    setClosed(true);
    navigate('/onlineOrdering/menu');
  };

  // Buttons na nag-sscroll ng product strip — kapalit/karagdagan sa
  // swipe-only na dating gamit. Isang function lang ito, gumagana kahit
  // ilan pa ang products (walang naka-hardcode na bilang ng "pages").
  const scrollTrack = (direction) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  // Escape key para makasara — konting polish na hindi naman event-specific
  useEffect(() => {
    if (closed || !adData) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closed, adData]);

  // Walang data pa (loading, walang live event, o failed fetch) o na-close
  // na ng user -> walang i-render, modal na modal talaga ngayon (hindi na
  // laging bukas gaya ng dati sa design-preview mode).
  if (closed || !adData) return null;

  const Icon = ICON_MAP[adData.event?.icon] || DEFAULT_ICON;
  const products = adData.products || [];
  const fallbackCopy = buildFallbackCopy(adData.event?.name);
  const badgeText = adData.event?.badge || fallbackCopy.badge;
  const titleText = adData.event?.title || fallbackCopy.title;
  const subtitleText = adData.event?.subtitle || fallbackCopy.subtitle;

  const endLabel =
    adData.event?.endMonth && adData.event?.endDay
      ? `Until ${MONTH_NAMES[adData.event.endMonth - 1]} ${adData.event.endDay}`
      : null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={adData.event?.title || 'Special event'}
      className="fixed left-0 right-0 bottom-0 z-[100] flex items-center justify-center px-4 py-6 sm:py-8"
      style={{ top: headerOffset }}
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
      `}</style>

      {/* Backdrop */}
      <button
        aria-label="Close"
        onClick={() => handleClose()}
        className="absolute inset-0 backdrop-blur-sm cursor-default"
        style={{ backgroundColor: `${BRAND.scrim}99` }}
      />

      {/* Card — mas makitid na ngayon (dating up to 760px, ngayon 520px)
          dahil DALAWA na lang ang default na visible na products, kaya
          hindi na kailangan ng sobrang lapad para dun; sa mobile,
          nananatiling narrow at naka-full-width */}
      <div
        className="event-ads-card relative w-full max-w-[380px] sm:max-w-[420px] md:max-w-[480px] lg:max-w-[520px] mt-8 mb-4 overflow-visible flex flex-col rounded-[22px] shadow-[0_30px_60px_-15px_rgba(42,22,8,0.45)] border"
        style={{
          backgroundColor: BRAND.cream,
          borderColor: BRAND.border,
          animation: 'eventTagDrop 0.5s ease-out',
          // Available height = full viewport minus header minus breathing
          // room top/bottom (kasama na dito ang space para sa medallion
          // stamp na pumapasok 24px sa itaas ng card).
          maxHeight: `calc(100vh - ${headerOffset}px - 64px)`,
        }}
      >
        {/* Close button */}
        <button
          onClick={() => handleClose()}
          aria-label="Close"
          className="absolute top-3 right-3 z-20 w-8 h-8 rounded-full bg-white/85 backdrop-blur-sm border flex items-center justify-center hover:bg-white transition-colors shadow-sm"
          style={{ borderColor: BRAND.border, color: BRAND.muted }}
        >
          <X size={15} />
        </button>

        {/* Stamp medallion — dashed "postmark" ring + solid ink seal.
            Fixed brand color, icon na lang ang nagbabago per event. */}
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
              <Icon size={18} className="text-white" strokeWidth={1.75} />
            </div>
          </div>
        </div>

        <div className="overflow-hidden flex-1 min-h-0 rounded-[22px]">
          {/* Header — fixed warm tint + subtle dot pattern, parehong kulay
              anuman ang event, texture lang ang nagbibigay ng buhay dito */}
          <div
            className="pt-8 pb-3 md:pt-9 md:pb-4 px-6 md:px-12 text-center rounded-t-[22px]"
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
              {badgeText}
            </span>
            <h2 className="font-serif text-[19px] sm:text-[22px] md:text-[25px] leading-[1.15] mb-1 line-clamp-2" style={{ color: BRAND.ink }}>
              {titleText}
            </h2>
            <p className="text-xs md:text-sm leading-snug max-w-[320px] md:max-w-[440px] mx-auto opacity-90 line-clamp-2" style={{ color: BRAND.muted }}>
              {subtitleText}
            </p>
            {endLabel && (
              <span
                className="inline-block mt-1.5 font-mono text-[9px] uppercase tracking-[0.2em] px-2.5 py-0.5 rounded-full border border-dashed"
                style={{ color: BRAND.faint, backgroundColor: `${BRAND.cream}B3`, borderColor: `${BRAND.ink}59` }}
              >
                {endLabel}
              </span>
            )}
          </div>

          {/* Ticket-style tear line, consistent with the homepage carousel */}
          {products.length > 0 && (
            <div className="relative w-full h-0">
              <div className="absolute -left-[13px] top-1/2 -translate-y-1/2 w-[26px] h-[26px] rounded-full shadow-[inset_-2px_0_4px_rgba(0,0,0,0.08)]" style={{ backgroundColor: BRAND.cream }} />
              <div className="absolute left-6 right-6 top-0 border-t-2 border-dotted" style={{ borderColor: BRAND.border }} />
              <div className="absolute -right-[13px] top-1/2 -translate-y-1/2 w-[26px] h-[26px] rounded-full shadow-[inset_2px_0_4px_rgba(0,0,0,0.08)]" style={{ backgroundColor: BRAND.cream }} />
            </div>
          )}

          {/* Featured products strip — parehong track ang ginagamit ng
              swipe (touch/trackpad) AT ng mga arrow button sa ibaba; hindi
              sila magkaiba, dalawang paraan lang papunta sa parehong
              scroll position. Kaya walang duplicate na logic. */}
          {products.length > 0 && (
            // Reserved gutters (px-9 md:px-12) sa magkabilang side — dito
            // nakaupo ang arrow buttons nang buo, kaya hindi na sila
            // na-cclip ng overflow-x-hidden ng scroll wrapper sa itaas
            // (dati, kalahati lang nila ang lumalabas dahil doon).
            <div className="relative px-9 md:px-12">
              <div
                ref={trackRef}
                className="event-ads-track flex gap-3 md:gap-4 overflow-x-auto py-2.5 snap-x snap-mandatory scroll-smooth"
              >
                {products.slice(0, 8).map((p) => {
                  const isVariable = p.pricing_mode === 'variable' && p.price_matrix?.length > 0;
                  const minPrice = isVariable
                    ? Math.min(...p.price_matrix.map((m) => m.price))
                    : p.price;

                  return (
                    // Width = (100% - 1 gap) / 2, kaya eksaktong DALAWA ang
                    // kasya sa unang tingin anuman ang laki ng modal (para
                    // di masyadong malapad); ang lumampas dito ay makikita
                    // lang sa pag-swipe o sa pag-click ng arrow buttons.
                    <div
                      key={p.id}
                      className="snap-start shrink-0 w-[calc((100%-12px)/2)] md:w-[calc((100%-16px)/2)] text-left group cursor-pointer"
                    >
                      {/* Price-tag card: image sa taas, tapos ang price ay
                          lumalabas parang swing tag na nakasabit sa
                          ibaba-kanan ng image — may "hole" notch at bahagyang
                          tilt para magmukhang literal na price tag. */}
                      <div
                        className="relative rounded-2xl overflow-visible border transition-all duration-300 group-hover:-translate-y-1 shadow-[0_2px_8px_-4px_rgba(42,22,8,0.25)] group-hover:shadow-[0_14px_22px_-10px_rgba(42,22,8,0.35)]"
                        style={{ backgroundColor: BRAND.cream, borderColor: BRAND.border }}
                      >
                        <div
                          className="relative aspect-[3/2] w-full flex items-center justify-center overflow-hidden rounded-t-2xl"
                          style={{ backgroundColor: BRAND.tint }}
                        >
                          {p.image_url ? (
                            <img
                              src={p.image_url}
                              alt={p.name}
                              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 ease-out"
                            />
                          ) : (
                            <Icon size={26} style={{ color: BRAND.ink }} className="opacity-30" />
                          )}
                        </div>

                        {/* Swing price tag — nakasabit sa seam ng image at
                            details, may hole notch at kaunting tilt */}
                        {minPrice != null && (
                          <div
                            className="absolute right-2 -bottom-3 z-10 transition-transform duration-300 group-hover:-rotate-3"
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

              {/* Arrow buttons — nakaupo na ngayon sa loob mismo ng
                  reserved gutter (hindi na naka-translate palabas), kaya
                  buo silang makikita at hindi na na-cclip. Lumalabas lang
                  kung may sapat na products para talagang may saysay
                  mag-scroll. */}
              {products.length > 2 && (
                <>
                  <button
                    type="button"
                    onClick={() => scrollTrack(-1)}
                    aria-label="Previous products"
                    className="hidden sm:flex absolute left-0 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full items-center justify-center border-2 shadow-md bg-white hover:scale-105 hover:shadow-lg transition-all z-10"
                    style={{ borderColor: BRAND.ink, color: BRAND.ink }}
                  >
                    <ChevronLeft size={17} strokeWidth={2.5} />
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollTrack(1)}
                    aria-label="Next products"
                    className="hidden sm:flex absolute right-0 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full items-center justify-center border-2 shadow-md bg-white hover:scale-105 hover:shadow-lg transition-all z-10"
                    style={{ borderColor: BRAND.ink, color: BRAND.ink }}
                  >
                    <ChevronRight size={17} strokeWidth={2.5} />
                  </button>
                </>
              )}
            </div>
          )}

          {/* CTA */}
          <div className="px-7 md:px-10 pb-4 md:pb-5 pt-0.5 flex flex-col items-center gap-1.5">
            <button
              onClick={handleShopNow}
              className="w-auto min-w-[160px] flex items-center justify-center gap-2 text-white font-bold text-xs uppercase tracking-[0.15em] py-2.5 px-8 rounded-full transition-transform hover:scale-[1.02] shadow-lg"
              style={{ backgroundColor: BRAND.ink }}
            >
              Shop Now!
              <ArrowRight size={14} />
            </button>
            <button
              onClick={() => handleClose()}
              className="text-[11px] font-semibold transition-colors hover:opacity-80"
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
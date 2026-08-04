import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Header from '../onlineOrdering/Header';
import Footer from '../onlineOrdering/Footer';

// Kunin ang base URL mula sa frontend .env file
const BUCKET_URL = import.meta.env.VITE_SUPABASE_STORAGE_URL;

// Gamitin ang bucket URL para sa mga standalone images
const heroImg = `${BUCKET_URL}/heroimg.png`;
const celebrationImg = `${BUCKET_URL}/images.png`;
const pastriesImg = `${BUCKET_URL}/imagee.png`;

const STEPS = [
  { n: '01', title: 'Browse the menu', copy: 'Cakes, pastries and celebration packages, all in one place.' },
  { n: '02', title: 'Add to your cart', copy: 'Choose flavors and themes for made-to-order items.' },
  { n: '03', title: 'Confirm details', copy: 'Tell us who it’s for, and when you’d like to pick it up.' },
  { n: '04', title: 'Enjoy', copy: 'Show your digital receipt at the counter and take it home.' },
];

const GALLERY = [
  `${BUCKET_URL}/image1.png`,
  `${BUCKET_URL}/image2.png`,
  `${BUCKET_URL}/image3.png`,
  `${BUCKET_URL}/image4.png`,
  `${BUCKET_URL}/image5.png`,
  `${BUCKET_URL}/image6.png`,
  `${BUCKET_URL}/image7.png`,
  `${BUCKET_URL}/image8.png`,
  `${BUCKET_URL}/image9.png`,
  `${BUCKET_URL}/image10.png`,
];

const FEATURES = [
  {
    title: 'Celebration Packages',
    copy: 'Themed cakes, cupcakes and balloons in one hassle-free set.',
    image: celebrationImg,
  },
  {
    title: 'Filipino Common Pastries',
    copy: 'Classic crinkles, brownies and premium ensaymada, baked daily.',
    image: pastriesImg,
  },
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

      {/* Smaller navigation buttons for mobile */}
      <button
        onClick={() => scrollByAmount(-1)}
        disabled={atStart}
        aria-label="Previous creations"
        className="flex absolute left-1 sm:-left-2 lg:-left-4 top-1/2 -translate-y-1/2 z-10 w-8 h-8 sm:w-11 sm:h-11 rounded-full bg-[#3B1F0A] text-white items-center justify-center shadow-lg hover:bg-[#2A1608] disabled:opacity-25 disabled:cursor-not-allowed transition-all"
      >
        <ChevronLeft size={16} className="sm:w-[18px] sm:h-[18px]" />
      </button>

      {/* Reduced height and padding for mobile */}
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
                className="w-full h-full object-cover saturate-[0.85] contrast-[0.96] hover:saturate-100 transition-all duration-500 ease-out"
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

export default function Home() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#FCFAF9] text-[#5A453C] font-sans">
      <Header page="home" />
      <main>
        {/* Hero — Tinanggal ang negative translation sa mobile at nilagyan ng py-6 */}
        <section className="w-full bg-[#E8E2DD] relative overflow-hidden min-h-[calc(100svh-70px)] lg:min-h-0 lg:h-[calc(100vh-76px)] flex items-center py-6 lg:py-0">
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
                    className="bg-[#3B1F0A] text-white px-6 py-3.5 sm:px-10 sm:py-4 text-xs sm:text-sm uppercase tracking-[0.15em] font-semibold rounded-full hover:bg-[#2A1608] transition-colors w-full sm:w-auto text-center"
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

        {/* How to order */}
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

        {/* Some Past Creations */}
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

        {/* Custom orders + features */}
        <section className="w-full bg-[#FCFAF9] min-h-[550px] sm:min-h-[600px] lg:min-h-0 lg:h-[calc(100vh-76px)] overflow-hidden flex items-center">
          <div className="max-w-[1300px] w-full mx-auto px-5 sm:px-8 py-10 sm:py-16 lg:py-8 h-full flex flex-col justify-center">
            <div className="text-center mb-8 sm:mb-10 lg:mb-8 shrink-0">
              <p className="text-sm sm:text-lg text-[#5A453C] mb-3 sm:mb-4">
                Want something customized for your special day?
              </p>
              <button
                onClick={() => navigate('/onlineOrdering/menu')}
                className="font-mono text-[10px] sm:text-xs uppercase tracking-[0.2em] text-[#3B1F0A] border-b border-[#3B1F0A] pb-1 hover:text-[#8A7264] hover:border-[#8A7264] transition-colors"
              >
                Start Your Order Here
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-8 h-[480px] sm:h-auto sm:aspect-[16/9] lg:aspect-auto lg:flex-1 lg:min-h-0">
              {FEATURES.map((f) => (
                <div
                  key={f.title}
                  className="relative h-full w-full rounded-xl sm:rounded-2xl overflow-hidden group"
                >
                  <img
                    src={f.image}
                    alt={f.title}
                    className="w-full h-full object-cover saturate-[0.9] group-hover:saturate-100 group-hover:scale-[1.03] transition-all duration-500 ease-out"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 lg:p-8">
                    <h3 className="font-serif text-lg sm:text-xl lg:text-2xl text-white mb-1.5 sm:mb-2">{f.title}</h3>
                    <p className="text-white/80 text-xs sm:text-sm lg:text-base max-w-[95%] leading-relaxed">{f.copy}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, X, Check, Home, UtensilsCrossed } from 'lucide-react';
import brandLogo from '../../../src/assets/427bffe9-d983-4566-9ec9-de6c2b1bdaa2-removebg-preview.png';

const STEPS = [
  { id: 1, label: 'Select Items' },
  { id: 2, label: 'Details' },
  { id: 3, label: 'Payment' },
  { id: 4, label: 'Complete' },
];

function MobileSteps({ page }) {
  if (!['menu', 'checkout', 'payment', 'confirm'].includes(page)) return null;

  const activeIndex = page === 'menu' ? 1 : page === 'checkout' ? 2 : page === 'payment' ? 3 : 4;
  const progressPct = ((activeIndex - 1) / (STEPS.length - 1)) * 100;

  const getState = (stepId) => {
    if (stepId < activeIndex) return 'completed';
    if (stepId === activeIndex) return 'active';
    return 'upcoming';
  };

  return (
    <div className="lg:hidden bg-white py-1.5 sm:py-2.5 relative z-20 border-b border-[#EAE4E0] w-full overflow-x-hidden">
      <div className="max-w-3xl mx-auto px-2 sm:px-6 relative">
        <div className="absolute top-[17px] sm:top-[19px] left-[12.5%] right-[12.5%] h-[2px] bg-[#EAE4E0] rounded-full" />
        <div
          className="absolute top-[17px] sm:top-[19px] left-[12.5%] h-[2px] bg-gradient-to-r from-[#D4A87A] to-[#5A453C] rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progressPct * 0.75}%` }}
        />
        <div className="flex justify-between relative z-10">
          {STEPS.map((s, idx) => {
            const state = getState(s.id);
            const isDone = state === 'completed' || (s.id === 4 && page === 'confirm');
            const isActive = state === 'active';
            return (
              <div key={s.id} className="flex flex-col items-center gap-1.5 sm:gap-2 flex-1 px-0.5 min-w-0">
                <div
                  className={`relative w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-bold text-[12px] sm:text-[15px] shrink-0 transition-colors duration-300 ease-out ${
                    isDone
                      ? 'bg-[#5A453C] text-white shadow-sm'
                      : isActive
                      ? 'bg-white text-[#5A453C] shadow-[0_0_0_4px_#F3ECE6]'
                      : 'bg-white text-[#B7A99F]'
                  }`}
                >
                  <svg viewBox="0 0 36 36" className="absolute inset-0 w-full h-full -rotate-90">
                    <circle
                      cx="18" cy="18" r="16" fill="none"
                      stroke={isDone || isActive ? '#5A453C' : '#EAE4E0'}
                      strokeWidth="2"
                      strokeDasharray={100.53}
                      strokeDashoffset={isDone || isActive ? 0 : 100.53}
                      strokeLinecap="round"
                      style={{ transition: 'stroke-dashoffset 700ms ease-in-out, stroke 400ms ease' }}
                    />
                  </svg>
                  <span
                    className={`relative transition-opacity duration-200 ease-out ${
                      isDone ? 'opacity-0' : 'opacity-100'
                    }`}
                    style={{ transitionDelay: isDone ? '0ms' : '250ms' }}
                  >
                    {s.id}
                  </span>
                  <span
                    className={`absolute inset-0 flex items-center justify-center transition-opacity duration-200 ease-out ${
                      isDone ? 'opacity-100' : 'opacity-0'
                    }`}
                    style={{ transitionDelay: isDone ? '550ms' : '0ms' }}
                  >
                    <Check size={16} strokeWidth={3} />
                  </span>
                </div>
                <div
                  className={`text-[9px] sm:text-[13px] font-bold text-center leading-tight tracking-wide uppercase sm:normal-case break-words transition-colors duration-300 ${
                    isDone || state === 'active' ? 'text-[#4A3B36]' : 'text-[#B7A99F]'
                  }`}
                >
                  {s.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DesktopSideSteps({ page }) {
  if (!['menu', 'checkout', 'payment', 'confirm'].includes(page)) return null;

  const activeIndex = page === 'menu' ? 1 : page === 'checkout' ? 2 : page === 'payment' ? 3 : 4;

  const getState = (stepId) => {
    if (stepId < activeIndex) return 'completed';
    if (stepId === activeIndex) return 'active';
    return 'upcoming';
  };

  return (
    // Mas inusog pakaliwa (left-4) para hindi kumain ng space sa gitna
    <div className="hidden lg:flex flex-col items-start absolute left-4 xl:left-6 top-[120px] h-[calc(100vh-220px)] max-h-[600px] z-[50]">
      {STEPS.map((s, idx) => {
        const state = getState(s.id);
        const isDone = state === 'completed' || (s.id === 4 && page === 'confirm');
        const isActive = state === 'active';
        const isLast = idx === STEPS.length - 1;

        return (
          <div key={s.id} className={`flex flex-col ${!isLast ? 'flex-1' : ''}`}>
            {/* Pinaliit ang gap (gap-2.5) para mas siksik ang width */}
            <div className="flex items-center gap-2.5 group/step">
              {/* Pinaliit ang bilog (w-8 h-8) para lumiit ang sakop na width */}
              <div
                className={`relative w-8 h-8 rounded-full flex items-center justify-center font-bold text-[12px] shrink-0 transition-colors duration-300 ease-out ${
                  isDone
                    ? 'bg-[#5A453C] text-white shadow-sm'
                    : isActive
                    ? 'bg-white text-[#5A453C] shadow-[0_0_0_5px_#F3ECE6]'
                    : 'bg-white text-[#B7A99F]'
                }`}
              >
                <svg viewBox="0 0 36 36" className="absolute inset-0 w-full h-full -rotate-90">
                  <circle
                    cx="18" cy="18" r="16" fill="none"
                    stroke={isDone || isActive ? '#5A453C' : '#EAE4E0'}
                    strokeWidth="2"
                    strokeDasharray={100.53}
                    strokeDashoffset={isDone || isActive ? 0 : 100.53}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-dashoffset 700ms ease-in-out, stroke 400ms ease' }}
                  />
                </svg>
                <span
                  className={`relative transition-opacity duration-200 ease-out ${
                    isDone ? 'opacity-0' : 'opacity-100'
                  }`}
                  style={{ transitionDelay: isDone ? '0ms' : '250ms' }}
                >
                  {s.id}
                </span>
                <span
                  className={`absolute inset-0 flex items-center justify-center transition-opacity duration-200 ease-out ${
                    isDone ? 'opacity-100' : 'opacity-0'
                  }`}
                  style={{ transitionDelay: isDone ? '550ms' : '0ms' }}
                >
                  <Check size={14} strokeWidth={3} />
                </span>
              </div>
              <span
                className={`text-[10px] font-bold uppercase tracking-widest whitespace-nowrap transition-colors duration-300 ease-out ${
                  isDone || isActive
                    ? 'opacity-100 text-[#4A3B36]'
                    : 'opacity-70 group-hover/step:opacity-100 text-[#B7A99F]'
                }`}
              >
                {s.label}
              </span>
            </div>

            {!isLast && (
              <div className="relative w-[2px] flex-1 ml-[15px] my-2 rounded-full bg-[#EAE4E0] overflow-hidden">
                <div
                  className="absolute top-0 left-0 w-full bg-gradient-to-b from-[#D4A87A] to-[#5A453C] rounded-full"
                  style={{
                    height: s.id < activeIndex ? '100%' : '0%',
                    transition: 'height 700ms ease-in-out',
                  }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function Header({ page }) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const navItems = [
    { key: 'home', label: 'Home', to: '/onlineOrdering/home', icon: Home },
    { key: 'menu', label: 'Menu', to: '/onlineOrdering/menu', icon: UtensilsCrossed },
  ];

  // Ang checkout/payment/confirm ay parte pa rin ng "Menu" flow — walang ibang
  // nav item na dapat mag-highlight kapag naroon ang customer, kaya "Menu" pa
  // rin ang dapat aktibo sa itaas na navigation.
  const activeNavKey = ['checkout', 'payment', 'confirm'].includes(page) ? 'menu' : page;

  const go = (to) => {
    navigate(to);
    setMenuOpen(false);
  };

  return (
    <>
      <header className="sticky top-0 z-[1000] flex flex-col shadow-[0_2px_10px_rgba(0,0,0,0.12)] w-full overflow-x-hidden">
        <div className="bg-[#3B1F0A] relative">
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-[-60px] right-[10%] w-[200px] h-[200px] rounded-full bg-white/[0.04]" />
            <div className="absolute bottom-[-90px] left-[5%] w-[180px] h-[180px] rounded-full bg-black/[0.15]" />
          </div>

          <div className="relative z-10 w-full mx-auto px-4 sm:px-8 lg:px-20 h-16 sm:h-20 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 sm:flex-initial">
              <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full overflow-hidden shrink-0">
                <img
                  src={brandLogo}
                  alt="Aileen Cake Max"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="leading-tight min-w-0">
                <div className="font-serif font-black text-[15px] sm:text-xl text-white tracking-tight truncate">
                  Aileen Cake Max
                </div>
                <div className="text-[8px] sm:text-[10px] text-[#D4A87A] tracking-[0.2em] uppercase font-semibold truncate">
                  Bake Shop
                </div>
              </div>
            </div>

            <nav className="hidden sm:flex gap-2 items-center shrink-0">
              {navItems.map((item) => (
                <span
                  key={item.key}
                  className={`text-sm font-semibold cursor-pointer transition-all duration-200 px-5 py-2 rounded-full border ${
                    activeNavKey === item.key
                      ? 'bg-[#D4A87A]/15 border-[#D4A87A]/50 text-[#F3DFC0] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
                      : 'border-transparent text-white/70 hover:text-white hover:bg-white/5 hover:border-white/10'
                  }`}
                  onClick={() => go(item.to)}
                >
                  {item.label}
                </span>
              ))}
            </nav>

            <button
              className="sm:hidden relative w-10 h-10 rounded-xl border border-white/15 bg-white/5 flex items-center justify-center text-white/90 hover:bg-white/10 hover:border-white/25 transition-colors shrink-0"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Toggle navigation"
            >
              {menuOpen ? <X size={19} /> : <Menu size={19} />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <div
            className="sm:hidden fixed inset-0 top-16 z-[1100] bg-black/40"
            onClick={() => setMenuOpen(false)}
          >
            <nav
              className="bg-[#3B1F0A] shadow-[0_10px_20px_rgba(0,0,0,0.3)] flex flex-col gap-1 px-4 py-4 border-t border-white/10"
              onClick={(e) => e.stopPropagation()}
            >
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeNavKey === item.key;
                return (
                  <span
                    key={item.key}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold cursor-pointer transition-colors ${
                      active ? 'bg-[#D4A87A]/15 text-[#F3DFC0]' : 'text-white/80 hover:bg-white/5 hover:text-white'
                    }`}
                    onClick={() => go(item.to)}
                  >
                    <Icon size={16} className={active ? 'text-[#D4A87A]' : 'text-white/40'} />
                    {item.label}
                  </span>
                );
              })}
            </nav>
          </div>
        )}

        <MobileSteps page={page} />
      </header>
      
      <DesktopSideSteps page={page} />
    </>
  );
}
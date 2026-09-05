import { Phone, Mail, MapPin } from 'lucide-react';
import brandLogo from '../../../src/assets/427bffe9-d983-4566-9ec9-de6c2b1bdaa2-removebg-preview.png';

// lucide-react removed brand/social icons from the library, so these two
// are small inline SVGs instead of imports (keeps zero extra dependencies).
function FacebookIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M22 12.06C22 6.505 17.523 2 12 2S2 6.505 2 12.06c0 5.02 3.657 9.184 8.438 9.94v-7.03H7.898v-2.91h2.54V9.845c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562v1.877h2.773l-.443 2.91h-2.33V22c4.78-.756 8.437-4.92 8.437-9.94Z" />
    </svg>
  );
}

export default function Footer() {
  const hours = [
    { day: 'Mon - Fri', time: '8:00 AM - 6:00 PM' },
    { day: 'Saturday', time: '9:00 AM - 5:00 PM' },
    { day: 'Sunday', time: 'Closed', muted: true },
  ];

  return (
    <footer className="w-full bg-[#3B1F0A] relative overflow-hidden border-t border-white/5">
      {/* Ambient brand accents */}
      <div className="absolute top-[-90px] right-[-70px] w-[260px] h-[260px] rounded-full bg-white/[0.03] pointer-events-none" />
      <div className="absolute bottom-[-110px] left-[-90px] w-[320px] h-[320px] rounded-full bg-white/[0.02] pointer-events-none" />

      {/* Clean accent line */}
      <div className="h-[3px] w-full bg-gradient-to-r from-[#D4A87A]/0 via-[#D4A87A] to-[#D4A87A]/0" />

      <div className="max-w-[1200px] mx-auto px-5 sm:px-8 pt-8 sm:pt-12 pb-5 sm:pb-6 relative z-10">
        {/* Grid updated to 3 columns on desktop since "Explore" is removed */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-8 sm:gap-10 mb-6 sm:mb-10">
          
          {/* Brand - Span full width on mobile, 1 col on desktop */}
          <div className="flex flex-col gap-3 sm:gap-4 col-span-2 lg:col-span-1">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full overflow-hidden shrink-0">
                <img
                  src={brandLogo}
                  alt="Aileen Cake Max"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="leading-none">
                <h1 className="text-white font-serif text-base sm:text-lg font-bold tracking-tight">Aileen Cake Max</h1>
                <p className="text-[#D4A87A] text-[9px] uppercase tracking-[0.2em] font-semibold mt-1">Bake Shop</p>
              </div>
            </div>
            <p className="text-white/70 text-[11px] sm:text-[12px] leading-relaxed max-w-[240px] font-light">
              Handcrafting moments of joy through artisan cakes and pastries, baked fresh daily.
            </p>
            <div className="flex items-center gap-3 mt-1">
              <a
                href="https://www.facebook.com/cakebymax"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Facebook"
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-white/15 flex items-center justify-center text-white/70 hover:text-[#3B1F0A] hover:bg-[#D4A87A] hover:border-[#D4A87A] transition-colors"
              >
                <FacebookIcon width={14} height={14} />
              </a>
            </div>
          </div>

          {/* Contact */}
          <div className="col-span-1">
            <h4 className="text-[#D4A87A] text-[9px] sm:text-[10px] uppercase tracking-[0.15em] font-bold mb-3 sm:mb-5">Contact Us</h4>
            <ul className="flex flex-col gap-2 sm:gap-3 text-[11px] sm:text-[12px] text-white/80">
              <li className="flex items-center gap-2">
                <Phone size={12} className="text-[#D4A87A] shrink-0" />
                0912-345-6789
              </li>
              <li className="flex items-center gap-2">
                <Mail size={12} className="text-[#D4A87A] shrink-0" />
                <span className="truncate">hello@aileencakemax.com</span>
              </li>
              <li className="flex items-start gap-2">
                <MapPin size={12} className="text-[#D4A87A] shrink-0 mt-0.5" />
                <span className="leading-tight">Poblacion 4, Calaca City, Batangas</span>
              </li>
            </ul>
          </div>

          {/* Hours */}
          <div className="col-span-1">
            <h4 className="text-[#D4A87A] text-[9px] sm:text-[10px] uppercase tracking-[0.15em] font-bold mb-3 sm:mb-5">Shop Hours</h4>
            <ul className="flex flex-col text-[11px] text-white/80">
              {hours.map((h, i) => (
                <li
                  key={h.day}
                  className={`flex justify-between py-1.5 sm:py-2 ${i !== hours.length - 1 ? 'border-b border-white/10' : ''}`}
                >
                  <span>{h.day}</span>
                  <span className={h.muted ? 'text-red-400/80 font-semibold' : 'text-white'}>{h.time}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Footer Bottom */}
        <div className="pt-5 sm:pt-6 border-t border-white/10 flex justify-center items-center">
          <p className="text-[8px] sm:text-[9px] uppercase tracking-[0.2em] text-white/30 text-center">
            © 2026 Aileen Cake Max. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
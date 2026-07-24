import { Menu } from 'lucide-react';

export default function HamburgerMenu({ onMenuClick }) {
  return (
    <button
      onClick={onMenuClick}
      className="md:hidden w-9 h-9 -ml-1 rounded-lg flex items-center justify-center text-brand-700 hover:bg-brand-50 transition-colors shrink-0"
      aria-label="Open menu"
    >
      <Menu size={20} strokeWidth={2.2} />
    </button>
  );
}
import { Archive, ArrowLeft } from 'lucide-react';
import { Button } from '../../components/ui/index';

// Shared Archives control. Always sits at the far right of a section header,
// directly after the "Add New ..." button, so every archive-enabled tab
// has the same position, size and look.
export default function ArchiveToggle({ active, count = 0, backLabel = 'Back', onClick, className = '' }) {
  return (
    <Button variant="secondary" onClick={onClick} aria-label={active ? backLabel : 'Archives'} title={active ? backLabel : 'Archives'} className={`shrink-0 justify-center ${className}`}>
      {active ? (
        <><ArrowLeft size={14} /> {backLabel}</>
      ) : (
        <>
          <Archive size={14} /> <span className="hidden sm:inline">Archives</span>
          {count > 0 && (
            <span className="text-[11px] font-bold text-brand-600 bg-brand-100 px-1.5 py-0.5 rounded-full leading-none">{count}</span>
          )}
        </>
      )}
    </Button>
  );
}
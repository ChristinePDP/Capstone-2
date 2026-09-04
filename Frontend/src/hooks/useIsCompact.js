import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Decides between "cards" and "table" layout based on the ACTUAL width of the
 * element `ref` is attached to — not the browser viewport.
 *
 * Why not Tailwind's `md:` breakpoint? Because `md:` reacts to the full
 * window width. The sidebar (76–220px) eats into the space actually left for
 * the table, so on a narrower window the visible content area can be
 * squeezed down to phone-sized width while the window itself is still
 * "desktop" width by Tailwind's math — the table then still renders and
 * overflows instead of switching to cards.
 *
 * Usage:
 *   const [containerRef, isCompact] = useIsCompact();
 *   <div ref={containerRef}>
 *     {isCompact ? <CardsView /> : <TableView />}
 *   </div>
 *
 * @param {number} breakpoint - container width (px) below which to use cards.
 */
export function useIsCompact(breakpoint = 680) {
  const containerRef = useRef(null);
  const [isCompact, setIsCompact] = useState(true); // mobile-first default avoids a table flash on first paint

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Measure once immediately so there's no flash of the wrong layout.
    setIsCompact(el.getBoundingClientRect().width < breakpoint);

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width != null) setIsCompact(width < breakpoint);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [breakpoint]);

  return [containerRef, isCompact];
}
import { useEffect, useState } from 'react';

/**
 * The player page's four layouts (player UI handoff, 2026-11-15), chosen by the viewport's size
 * and shape rather than the device, and updated live on resize and rotation.
 *
 * - `phoneLandscape`: short and wide (height under 500 px): map left, a tool rail right.
 * - `phonePortrait`: narrow (width under 600 px): map, a character strip, a bottom tab bar.
 * - `tabletPortrait`: taller than wide, at least 700 px wide: map above a split panel.
 * - `wide`: everything else (laptops, tablets in landscape): a permanent right panel.
 */
export type Layout = 'phonePortrait' | 'phoneLandscape' | 'tabletPortrait' | 'wide';

export function layoutFor(width: number, height: number): Layout {
  if (height < 500 && width > height) return 'phoneLandscape';
  if (width < 600) return 'phonePortrait';
  if (height > width && width >= 700) return 'tabletPortrait';
  if (height > width) return 'phonePortrait';
  return 'wide';
}

/** The tools a layout always shows one of; the phone layouts can have none open. */
export const persistentTools = (layout: Layout) => layout === 'wide' || layout === 'tabletPortrait';

export function useLayout(): Layout {
  const read = () => layoutFor(window.innerWidth, window.innerHeight);
  const [layout, setLayout] = useState<Layout>(read);
  useEffect(() => {
    const update = () => setLayout(read());
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    const queries = ['(orientation: portrait)', '(max-width: 599px)', '(max-height: 499px)'].map(
      (q) => window.matchMedia?.(q),
    );
    for (const q of queries) q?.addEventListener?.('change', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      for (const q of queries) q?.removeEventListener?.('change', update);
    };
  }, []);
  return layout;
}

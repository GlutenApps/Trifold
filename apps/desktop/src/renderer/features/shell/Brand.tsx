/**
 * The brand in the UI (docs/brand/BRAND.md §3): the mark on its own where space is tight, the
 * lockups (mark + wordmark) where the name should show. Each follows the Library theme, because
 * the kit has separate on-dark and on-light versions and they are never recoloured.
 */
import { useAppStore } from '../../stores/appStore';
import { TrifoldMark } from './TrifoldMark';
import horizontalOnDark from '../../assets/brand/lockup-horizontal-on-dark.svg';
import horizontalOnLight from '../../assets/brand/lockup-horizontal-on-light.svg';
import stackedOnDark from '../../assets/brand/lockup-stacked-on-dark.svg';
import stackedOnLight from '../../assets/brand/lockup-stacked-on-light.svg';
import wordmarkOnDark from '../../assets/brand/wordmark-on-dark.svg';
import wordmarkOnLight from '../../assets/brand/wordmark-on-light.svg';

const WORDMARKS = { dark: wordmarkOnDark, light: wordmarkOnLight } as const;

/**
 * The horizontal lockup's proportions, measured from its artwork in units of the mark's height
 * (177.8): the wordmark file is 120.66 tall around 100.6 of lettering, centred on the mark, and
 * the lettering starts 34.8 after the mark, 10 of that inside the wordmark file's own margin.
 */
const WORDMARK_HEIGHT = 120.66 / 177.8;
const WORDMARK_GAP = (34.8 - 10.04) / 177.8;

const LOCKUPS = {
  horizontal: { dark: horizontalOnDark, light: horizontalOnLight },
  stacked: { dark: stackedOnDark, light: stackedOnLight },
} as const;

function useSurface(): 'dark' | 'light' {
  return useAppStore((s) => (s.library?.settings?.theme === 'light' ? 'light' : 'dark'));
}

/** The bare mark, shaded for the current theme. Decorative unless given a title. */
export function BrandMark({ size, title }: { size: number; title?: string }) {
  return <TrifoldMark variant={useSurface()} size={size} title={title} className="brand-mark" />;
}

/**
 * The wordmark alone, sized and spaced to sit right of a BrandMark of `markSize` exactly as in
 * the horizontal lockup. A bar that shows the name only some of the time puts this beside its
 * mark, so the mark itself never changes or moves. Decorative: the parent names the control.
 */
export function BrandWordmark({ markSize }: { markSize: number }) {
  return (
    <img
      className="brand-wordmark"
      src={WORDMARKS[useSurface()]}
      alt=""
      height={Math.round(markSize * WORDMARK_HEIGHT)}
      style={{ marginLeft: Math.round(markSize * WORDMARK_GAP) }}
      draggable={false}
    />
  );
}

/**
 * The mark with the "Trifold" wordmark. Horizontal for bars and headers (24 px tall at least),
 * stacked for centred placements. `alt` is the accessible name; pass "" when a parent names it.
 */
export function BrandLockup({
  layout,
  height,
  alt = 'Trifold',
}: {
  layout: 'horizontal' | 'stacked';
  height: number;
  alt?: string;
}) {
  return (
    <img
      className={`brand-lockup ${layout}`}
      src={LOCKUPS[layout][useSurface()]}
      alt={alt}
      height={height}
      draggable={false}
    />
  );
}

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
 * there (165.73 drawn, scaled to 85% = 140.87; BRAND.md §1 lockup rules). The wordmark file is
 * 120.67 tall and its centre sits 1.4 above the mark's (under a pixel at bar sizes, so the bar
 * simply centres both). The T starts 33.65 after the mark, 10.06 of that inside the wordmark
 * file's own margin.
 */
const LOCKUP_MARK_HEIGHT = 165.73 * 0.85;
const WORDMARK_HEIGHT = 120.67 / LOCKUP_MARK_HEIGHT;
const WORDMARK_GAP = (33.65 - 10.06) / LOCKUP_MARK_HEIGHT;

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

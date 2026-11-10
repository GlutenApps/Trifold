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

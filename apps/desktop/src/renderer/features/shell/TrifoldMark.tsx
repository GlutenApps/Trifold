// TrifoldMark.tsx — the Trifold mark (a rust hexagon inside a three-part frame) as an inline React SVG.
// Generated from source/trifold-logo-color.svg; do not hand-edit the path data. See BRAND.md.
import type { SVGProps } from 'react';

type Variant = 'dark' | 'light';
const VIEWBOX = '0 0 149.29 165.73';

const FRAME = [
  'M 30.49,51.19 l 38.8,-22.4 c 3.32,-1.91 7.4,-1.91 10.73,0 l 0,0 c 5.01,2.89 11.43,1.17 14.32,-3.84 l 7.32,-12.68 l -16.29,-9.4 c -6.63,-3.83 -14.81,-3.83 -21.44,0 l -53.2,30.72 c -6.63,3.83 -10.73,10.9 -10.73,18.56 l 0,18.81 l 14.65,0 c 5.79,0 10.48,-4.7 10.48,-10.49 l 0,0 c 0,-3.83 2.05,-7.36 5.36,-9.28 Z',
  'M 122.28,24.18 l -7.31,12.68 c -2.9,5.02 -1.18,11.43 3.83,14.33 l 0,0 c 3.32,1.91 5.37,5.45 5.37,9.28 l 0,44.8 c 0,3.83 -2.05,7.36 -5.37,9.28 l 0,0 c -5.01,2.9 -6.73,9.32 -3.83,14.33 l 7.31,12.68 l 16.29,-9.41 c 6.63,-3.83 10.72,-10.9 10.72,-18.56 l 0,-61.44 c 0,-7.66 -4.08,-14.73 -10.72,-18.56 l -16.29,-9.41 Z',
  'M 69.29,136.94 l -38.8,-22.4 c -3.31,-1.91 -5.36,-5.45 -5.36,-9.28 l 0,0 c 0,-5.8 -4.7,-10.49 -10.48,-10.49 l -14.65,0 l 0,18.81 c 0,7.66 4.09,14.73 10.73,18.56 l 53.2,30.72 c 6.63,3.83 14.81,3.83 21.44,0 l 16.29,-9.4 l -7.32,-12.68 c -2.89,-5.01 -9.31,-6.73 -14.32,-3.84 l 0,0 c -3.32,1.91 -7.4,1.91 -10.73,0 Z',
];
const CORE =
  'M 70.06,55.14 l -17.13,9.89 c -2.83,1.64 -4.58,4.66 -4.58,7.94 l 0,19.78 c 0,3.28 1.75,6.3 4.58,7.94 l 17.13,9.89 c 2.84,1.63 6.34,1.63 9.17,0 l 17.13,-9.89 c 2.84,-1.64 4.58,-4.66 4.58,-7.94 l 0,-19.78 c 0,-3.28 -1.74,-6.3 -4.58,-7.94 l -17.13,-9.89 c -2.83,-1.63 -6.33,-1.63 -9.17,0 Z';

/** BRAND.md §2: the frame takes the surface's text colour, the core is rust. */
const COLORS: Record<Variant, { frame: string; core: string }> = {
  dark: { frame: '#E6E1D6', core: '#C45C45' },
  light: { frame: '#14181D', core: '#A84A30' },
};

export interface TrifoldMarkProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  /** "dark" for dark surfaces (default), "light" for light surfaces. */
  variant?: Variant;
  /** Rendered height in px; width follows the mark's aspect ratio. */
  size?: number;
  /** Accessible name; omit for decorative use. */
  title?: string;
}

export function TrifoldMark({ variant = 'dark', size = 24, title, ...rest }: TrifoldMarkProps) {
  const a11y = title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true };
  const { frame, core } = COLORS[variant];
  return (
    <svg
      viewBox={VIEWBOX}
      width={Math.round((size * 149.29) / 165.73)}
      height={size}
      {...a11y}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {FRAME.map((d) => (
        <path key={d} d={d} fill={frame} />
      ))}
      <path d={CORE} fill={core} />
    </svg>
  );
}

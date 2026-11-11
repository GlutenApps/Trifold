// TrifoldMark.tsx — the Trifold mark as an inline React SVG.
// Generated from source/trifold-logo-color.svg and trifold-logo-mono.svg; do not hand-edit the path data. See BRAND.md.
import type { SVGProps } from 'react';

type Variant = 'dark' | 'light' | 'mono';
const VIEWBOX = '0 0 180.05 177.80';
const MONO_VIEWBOX = '0 0 180.05 177.82';
const SHAPES: Record<'dark' | 'light', { d: string; fill: string }[]> = {
  dark: [
    {
      d: 'M 47.21,61.16 l -35.02,13.29 c -5.89,2.24 -12.19,-2.12 -12.19,-8.41 l 0,-6.89 c 0,-1.87 1.16,-3.54 2.9,-4.21 l 44.31,-16.82 l 0,23.03 Z',
      fill: '#8C846F',
    },
    {
      d: 'M 132.89,61.16 l 34.96,13.28 c 5.89,2.24 12.2,-2.11 12.2,-8.41 l 0,-6.96 c 0,-1.87 -1.15,-3.54 -2.9,-4.21 l -44.26,-16.82 l 0,23.11 Z',
      fill: '#8C846F',
    },
    { d: 'M 82.87,8.81 L 97.18,8.81 L 97.18,38.13 L 82.87,38.13 Z', fill: '#A84A30' },
    {
      d: 'M 94.2,3.55E-15 l -8.36,0 c -1.61,0 -3.09,0.86 -3.9,2.25 l -4.18,7.24 c -0.8,1.39 -0.8,3.11 0,4.5 l 4.18,7.24 c 0.8,1.39 2.29,2.25 3.9,2.25 l 8.36,0 c 1.61,0 3.09,-0.86 3.9,-2.25 l 4.18,-7.24 c 0.8,-1.39 0.8,-3.11 0,-4.5 l -4.18,-7.24 c -0.8,-1.39 -2.29,-2.25 -3.9,-2.25 Z',
      fill: '#C45C45',
    },
    { d: 'M 47.21,38.13 L 132.89,38.13 L 132.89,61.16 L 47.21,61.16 Z', fill: '#E3D3B0' },
    {
      d: 'M 90.05,61.16 l 0,116.64 c 0.86,0 1.72,-0.4 2.25,-1.21 l 18.36,-27.78 c 0.97,-1.47 1.49,-3.2 1.49,-4.96 l 0,-82.69 l -22.1,0 Z',
      fill: '#8C846F',
    },
    {
      d: 'M 90.05,61.16 l 0,116.64 c -0.86,0 -1.72,-0.4 -2.25,-1.21 l -18.36,-27.78 c -0.97,-1.47 -1.49,-3.2 -1.49,-4.96 l 0,-82.69 l 22.1,0 Z',
      fill: '#E3D3B0',
    },
  ],
  light: [
    {
      d: 'M 47.21,61.17 l -35.02,13.29 c -5.89,2.24 -12.19,-2.12 -12.19,-8.41 l 0,-6.89 c 0,-1.87 1.16,-3.54 2.9,-4.21 l 44.31,-16.82 l 0,23.03 Z',
      fill: '#383C3F',
    },
    {
      d: 'M 132.9,61.17 l 34.96,13.28 c 5.89,2.24 12.2,-2.11 12.2,-8.41 l 0,-6.96 c 0,-1.87 -1.15,-3.54 -2.9,-4.21 l -44.26,-16.82 l 0,23.11 Z',
      fill: '#383C3F',
    },
    { d: 'M 82.87,8.81 L 97.18,8.81 L 97.18,38.13 L 82.87,38.13 Z', fill: '#A84A30' },
    {
      d: 'M 94.2,0 l -8.36,0 c -1.61,0 -3.09,0.86 -3.9,2.25 l -4.18,7.24 c -0.8,1.39 -0.8,3.11 0,4.5 l 4.18,7.24 c 0.8,1.39 2.29,2.25 3.9,2.25 l 8.36,0 c 1.61,0 3.09,-0.86 3.9,-2.25 l 4.18,-7.24 c 0.8,-1.39 0.8,-3.11 0,-4.5 l -4.18,-7.24 c -0.8,-1.39 -2.29,-2.25 -3.9,-2.25 Z',
      fill: '#C45C45',
    },
    { d: 'M 47.21,38.13 L 132.89,38.13 L 132.89,61.16 L 47.21,61.16 Z', fill: '#6E7377' },
    {
      d: 'M 90.05,61.17 l 0,116.64 c 0.86,0 1.72,-0.4 2.25,-1.21 l 18.36,-27.78 c 0.97,-1.47 1.49,-3.2 1.49,-4.96 l 0,-82.69 l -22.1,0 Z',
      fill: '#383C3F',
    },
    {
      d: 'M 90.05,61.17 l 0,116.64 c -0.86,0 -1.72,-0.4 -2.25,-1.21 l -18.36,-27.78 c -0.97,-1.47 -1.49,-3.2 -1.49,-4.96 l 0,-82.69 l 22.1,0 Z',
      fill: '#6E7377',
    },
  ],
};
const MONO_SHAPES: { d: string }[] = [
  {
    d: 'M 177.16,54.89 l -44.26,-16.82 l 0,0.07 l -35.71,0 l 0,-15.8 c 0.36,-0.32 0.67,-0.69 0.92,-1.11 l 4.18,-7.24 c 0.8,-1.39 0.8,-3.11 0,-4.5 l -4.18,-7.24 c -0.8,-1.39 -2.29,-2.25 -3.9,-2.25 l -8.36,0 c -1.61,0 -3.09,0.86 -3.9,2.25 l -4.18,7.24 c -0.8,1.39 -0.8,3.11 0,4.5 l 4.18,7.24 c 0.25,0.43 0.56,0.8 0.92,1.11 l 0,15.8 l -35.66,0 l -44.31,16.82 c -1.75,0.66 -2.9,2.34 -2.9,4.21 l 0,6.89 c 0,6.3 6.3,10.65 12.19,8.41 l 35.02,-13.29 l 20.74,0 l 0,82.69 c 0,1.76 0.52,3.49 1.49,4.96 l 18.36,27.78 c 0.53,0.81 1.39,1.21 2.25,1.21 c 0.86,0 1.72,-0.4 2.25,-1.21 l 18.36,-27.78 c 0.97,-1.47 1.49,-3.2 1.49,-4.96 l 0,-82.69 l 20.74,0 l 34.96,13.28 c 5.89,2.24 12.2,-2.11 12.2,-8.41 l 0,-6.96 c 0,-1.87 -1.15,-3.54 -2.9,-4.21 Z M 86.73,6.02 l 6.62,0 l 3.31,5.74 l -3.31,5.74 l -6.62,0 l -3.31,-5.74 l 3.31,-5.74 Z M 106.17,143.87 c 0,0.59 -0.17,1.16 -0.5,1.65 l -15.6,23.61 l 0,-107.95 l 16.1,0 l 0,82.69 Z',
  },
];

export interface TrifoldMarkProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  /** "dark" for dark surfaces (default), "light" for light surfaces, "mono" uses currentColor. */
  variant?: Variant;
  /** Rendered height in px; width follows the mark's aspect ratio. */
  size?: number;
  /** Accessible name; omit for decorative use. */
  title?: string;
}

export function TrifoldMark({ variant = 'dark', size = 24, title, ...rest }: TrifoldMarkProps) {
  const mono = variant === 'mono';
  const [w, h] = mono ? [180.05, 177.82] : [180.05, 177.8];
  const a11y = title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true };
  return (
    <svg
      viewBox={mono ? MONO_VIEWBOX : VIEWBOX}
      width={Math.round((size * w) / h)}
      height={size}
      {...a11y}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {mono ? (
        <g fill="currentColor">
          {MONO_SHAPES.map((s, i) => (
            <path key={i} d={s.d} />
          ))}
        </g>
      ) : (
        SHAPES[variant].map((s, i) => (
          // the same-colour stroke closes hairline seams where facets meet
          <path
            key={i}
            d={s.d}
            fill={s.fill}
            stroke={s.fill}
            strokeWidth={0.35}
            strokeLinejoin="round"
          />
        ))
      )}
    </svg>
  );
}

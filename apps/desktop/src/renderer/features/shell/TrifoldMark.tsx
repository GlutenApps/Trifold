// TrifoldMark.tsx — the Trifold sword mark as an inline React SVG.
// Generated from source/trifold-logo-color.svg; do not hand-edit the path data. See BRAND.md.
import type { SVGProps } from 'react';

type Variant = 'dark' | 'light';
const VIEWBOX = '0 0 180.05 177.80';
const SHAPES: Record<Variant, { d: string; fill: string }[]> = {
  dark: [
    {
      d: 'M 47.21,67.98 l -35.02,13.29 c -5.89,2.24 -12.19,-2.12 -12.19,-8.41 l 0,-13.7 c 0,-1.87 1.16,-3.54 2.9,-4.21 l 44.31,-16.82 l 0,29.85 Z',
      fill: '#8C846F',
    },
    {
      d: 'M 132.89,67.98 l 34.96,13.28 c 5.89,2.24 12.2,-2.11 12.2,-8.41 l 0,-13.77 c 0,-1.87 -1.15,-3.54 -2.9,-4.21 l -44.26,-16.82 l 0,29.92 Z',
      fill: '#8C846F',
    },
    { d: 'M 81.67,8.81 L 98.37,8.81 L 98.37,38.13 L 81.67,38.13 Z', fill: '#A84A30' },
    {
      d: 'M 94.69,3.55E-15 l -9.35,0 c -1.61,0 -3.09,0.86 -3.9,2.25 l -4.67,8.1 c -0.8,1.39 -0.8,3.11 0,4.5 l 4.67,8.1 c 0.8,1.39 2.29,2.25 3.9,2.25 l 9.35,0 c 1.61,0 3.09,-0.86 3.9,-2.25 l 4.67,-8.1 c 0.8,-1.39 0.8,-3.11 0,-4.5 l -4.67,-8.1 c -0.8,-1.39 -2.29,-2.25 -3.9,-2.25 Z',
      fill: '#C45C45',
    },
    {
      d: 'M 90.05,67.98 l 0,109.82 c 1,0 2.01,-0.4 2.63,-1.21 l 21.44,-27.78 c 1.14,-1.47 1.74,-3.2 1.74,-4.96 l 0,-75.87 l -25.81,0 Z',
      fill: '#8C846F',
    },
    {
      d: 'M 132.89,38.13 l -85.68,0 l 0,29.85 l 17.04,0 l 0,75.87 c 0,1.76 0.61,3.49 1.74,4.96 l 21.44,27.78 c 0.62,0.81 1.63,1.21 2.63,1.21 l 0,-109.82 l 42.84,0 l 0,-29.85 Z',
      fill: '#E3D3B0',
    },
  ],
  light: [
    {
      d: 'M 47.21,67.98 l -35.02,13.29 c -5.89,2.24 -12.19,-2.12 -12.19,-8.41 l 0,-13.7 c 0,-1.87 1.16,-3.54 2.9,-4.21 l 44.31,-16.82 l 0,29.85 Z',
      fill: '#383C3F',
    },
    {
      d: 'M 132.89,67.98 l 34.96,13.28 c 5.89,2.24 12.2,-2.11 12.2,-8.41 l 0,-13.77 c 0,-1.87 -1.15,-3.54 -2.9,-4.21 l -44.26,-16.82 l 0,29.92 Z',
      fill: '#383C3F',
    },
    { d: 'M 81.67,8.81 L 98.37,8.81 L 98.37,38.13 L 81.67,38.13 Z', fill: '#A84A30' },
    {
      d: 'M 94.69,3.55E-15 l -9.35,0 c -1.61,0 -3.09,0.86 -3.9,2.25 l -4.67,8.1 c -0.8,1.39 -0.8,3.11 0,4.5 l 4.67,8.1 c 0.8,1.39 2.29,2.25 3.9,2.25 l 9.35,0 c 1.61,0 3.09,-0.86 3.9,-2.25 l 4.67,-8.1 c 0.8,-1.39 0.8,-3.11 0,-4.5 l -4.67,-8.1 c -0.8,-1.39 -2.29,-2.25 -3.9,-2.25 Z',
      fill: '#C45C45',
    },
    {
      d: 'M 90.05,67.98 l 0,109.82 c 1,0 2.01,-0.4 2.63,-1.21 l 21.44,-27.78 c 1.14,-1.47 1.74,-3.2 1.74,-4.96 l 0,-75.87 l -25.81,0 Z',
      fill: '#383C3F',
    },
    {
      d: 'M 132.89,38.13 l -85.68,0 l 0,29.85 l 17.04,0 l 0,75.87 c 0,1.76 0.61,3.49 1.74,4.96 l 21.44,27.78 c 0.62,0.81 1.63,1.21 2.63,1.21 l 0,-109.82 l 42.84,0 l 0,-29.85 Z',
      fill: '#6E7377',
    },
  ],
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
  return (
    <svg
      viewBox={VIEWBOX}
      width={Math.round((size * 180.05) / 177.8)}
      height={size}
      {...a11y}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {SHAPES[variant].map((s, i) => (
        // the same-colour stroke closes hairline seams where shapes meet
        <path
          key={i}
          d={s.d}
          fill={s.fill}
          stroke={s.fill}
          strokeWidth={0.35}
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

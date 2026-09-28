import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TokenDisc } from './TokenDisc';

const base = {
  label: 'Goblin Boss',
  role: 'enemy' as const,
  kind: 'creature' as const,
  dead: false,
};

describe('TokenDisc', () => {
  it('masks the glyph into the disc when one is set', () => {
    render(
      <TokenDisc
        token={{ ...base, glyphUrl: 'trifold-media://icons/goblin-head.svg' }}
        style="engraved"
        size={70}
      />,
    );
    const glyph = screen.getByTestId('token-glyph');
    expect(glyph.style.maskImage).toContain('goblin-head.svg');
    expect(screen.queryByText('GB')).not.toBeInTheDocument();
  });

  it('falls back to initials without a glyph, and always for the plain treatment', () => {
    const { rerender } = render(<TokenDisc token={base} style="flat" size={70} />);
    expect(screen.getByText('GB')).toBeInTheDocument();
    rerender(
      <TokenDisc
        token={{ ...base, glyphUrl: 'trifold-media://icons/goblin-head.svg' }}
        style="plain"
        size={70}
      />,
    );
    expect(screen.getByText('GB')).toBeInTheDocument();
    expect(screen.queryByTestId('token-glyph')).not.toBeInTheDocument();
  });

  it('lets custom art win over the glyph', () => {
    render(
      <TokenDisc
        token={{
          ...base,
          artUrl: 'trifold-media://library/x.jpg',
          glyphUrl: 'trifold-media://icons/goblin-head.svg',
        }}
        style="engraved"
        size={70}
      />,
    );
    expect(screen.getByRole('presentation', { hidden: true })).toHaveAttribute(
      'src',
      'trifold-media://library/x.jpg',
    );
    expect(screen.queryByTestId('token-glyph')).not.toBeInTheDocument();
  });
});

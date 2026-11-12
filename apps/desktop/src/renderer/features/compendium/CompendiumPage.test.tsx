import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CompendiumRow } from '@trifold/api';
import { CompendiumPage } from './CompendiumPage';

/** One source pill per row, shortened, with a "+" when the record is elsewhere too (ADR 0027). */
const row = (over: Partial<CompendiumRow>): CompendiumRow => ({
  id: 'r1',
  kind: 'monster',
  key: 'aboleth',
  name: 'Aboleth',
  displayName: 'Aboleth',
  sourceId: 'srd-2024',
  sourceName: 'System Reference Document 5.2',
  edition: '2024',
  editions: ['2024'],
  otherVersions: [],
  cr: '10',
  type: 'aberration',
  size: 'L',
  environment: null,
  isNpc: false,
  level: null,
  typeCode: null,
  rarity: null,
  ...over,
});

describe('CompendiumPage list', () => {
  it('shows one shortened source pill, legacy marked, and a "+" naming the other versions', async () => {
    vi.mocked(window.trifold.compendium.search).mockResolvedValue({
      rows: [
        row({
          otherVersions: [{ sourceName: 'System Reference Document 5.1', edition: '2014' }],
        }),
        row({
          id: 'r2',
          key: 'acolyte',
          displayName: 'Acolyte',
          sourceName: 'System Reference Document 5.1',
          edition: '2014',
        }),
      ],
      total: 2,
      tookMs: 1,
    });
    render(<CompendiumPage />);
    const results = screen.getByRole('listbox', { name: 'Results' });
    const aboleth = await within(results).findByRole('option', { name: /Aboleth/ });
    expect(aboleth).toHaveTextContent('SRD 5.2');
    expect(within(aboleth).getByTestId('more-versions')).toHaveAttribute(
      'title',
      'Also in: System Reference Document 5.1 (legacy)',
    );
    const acolyte = within(results).getByRole('option', { name: /Acolyte/ });
    expect(acolyte).toHaveTextContent('SRD 5.1 · legacy');
    expect(within(acolyte).queryByTestId('more-versions')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { describeDisplays, identifyPage } from './displays';

const screen = (id: number, x: number, label = '', y = 0) => ({
  id,
  label,
  bounds: { x, y, width: 1920, height: 1080 },
  scaleFactor: 1,
  internal: false,
});

describe('describeDisplays', () => {
  it('numbers screens left to right and adds the monitor name when there is one', () => {
    const shown = describeDisplays(
      [screen(30, 1920, 'LG TV'), screen(10, 0), screen(20, -1920, '', 200)],
      10,
    );
    expect(shown.map((d) => [d.id, d.number, d.label, d.isPrimary])).toEqual([
      [30, 3, 'Display 3 · LG TV', false],
      [10, 2, 'Display 2', true],
      [20, 1, 'Display 1', false],
    ]);
  });

  it('never shows the internal display id', () => {
    const [only] = describeDisplays([screen(3796784692, 0, '  ')], 3796784692);
    expect(only?.label).toBe('Display 1');
  });
});

describe('identifyPage', () => {
  it('shows the number and escapes the monitor name', () => {
    const [d] = describeDisplays([screen(1, 0, '<b>TV</b>')], 1);
    const html = identifyPage(d!);
    expect(html).toContain('<div class="n">1</div>');
    expect(html).toContain('Display 1 · &lt;b&gt;TV&lt;/b&gt;');
    expect(html).toContain('Primary display');
  });
});

import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RollLogEntry } from '../../stores/rollLogStore';
import { REVEAL_MS, RollReveal } from './RollReveal';

function entry(total: number, outcome?: RollLogEntry['outcome'], id = 'r1'): RollLogEntry {
  return {
    id,
    at: 0,
    kind: 'dice',
    label: '1d20+5',
    expression: '1d20+5',
    total,
    faces: `1d20: ${total - 5}`,
    source: 'pool',
    ...(outcome ? { outcome } : {}),
  };
}

function mockReducedMotion(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn(() => ({ matches })),
  });
}

describe('RollReveal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockReducedMotion(false);
  });
  afterEach(() => vi.useRealTimers());

  it('tumbles, then settles on the real total with the crit flourish', () => {
    render(<RollReveal entry={entry(25, 'crit')} />);
    const reveal = screen.getByTestId('roll-reveal');
    expect(reveal).toHaveAttribute('data-settled', 'false');
    expect(reveal).not.toHaveClass('crit');
    act(() => vi.advanceTimersByTime(REVEAL_MS + 50));
    expect(reveal).toHaveAttribute('data-settled', 'true');
    expect(reveal).toHaveTextContent('25');
    expect(reveal).toHaveClass('crit');
    expect(reveal).toHaveClass('popped');
  });

  it('settles at once when the system asks for reduced motion', () => {
    mockReducedMotion(true);
    render(<RollReveal entry={entry(9, 'fumble')} />);
    const reveal = screen.getByTestId('roll-reveal');
    expect(reveal).toHaveAttribute('data-settled', 'true');
    expect(reveal).toHaveTextContent('9');
    expect(reveal).toHaveClass('fumble');
    expect(reveal).not.toHaveClass('popped');
  });

  it('settles early on a click', () => {
    render(<RollReveal entry={entry(14)} />);
    const reveal = screen.getByTestId('roll-reveal');
    act(() => vi.advanceTimersByTime(100));
    expect(reveal).toHaveAttribute('data-settled', 'false');
    act(() => reveal.click());
    expect(reveal).toHaveAttribute('data-settled', 'true');
    expect(reveal).toHaveTextContent('14');
  });

  it('restarts on a new entry, even one with the same total', () => {
    const { rerender } = render(<RollReveal entry={entry(14, undefined, 'a')} />);
    act(() => vi.advanceTimersByTime(REVEAL_MS + 50));
    const reveal = screen.getByTestId('roll-reveal');
    expect(reveal).toHaveAttribute('data-settled', 'true');
    rerender(<RollReveal entry={entry(14, undefined, 'b')} />);
    expect(reveal).toHaveAttribute('data-settled', 'false');
    act(() => vi.advanceTimersByTime(REVEAL_MS + 50));
    expect(reveal).toHaveTextContent('14');
  });

  it('shows the placeholder with no roll', () => {
    render(<RollReveal entry={null} placeholder="–" />);
    expect(screen.getByTestId('roll-reveal')).toHaveTextContent('–');
  });
});

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RollLogEntry } from '../../stores/rollLogStore';

/**
 * The roll reveal (DESIGN.md §6.7): a result is rolled and logged at once, and only its showing
 * is stretched. The number tumbles through stand-in faces for REVEAL_MS, slowing as it lands,
 * then settles on the real total with a pop. A natural 20 glows and a natural 1 shudders.
 * Clicking the number settles it early; the system's reduced-motion setting shows it at once.
 * Only a fresh roll tumbles: a panel that opens on an older one shows it settled, so opening the
 * Dice pop-up never looks like a re-roll.
 */

export const REVEAL_MS = 600;

export interface Reveal {
  /** The number on screen right now: a stand-in while tumbling, the real total once settled. */
  shown: number | null;
  settled: boolean;
  /** True once a tumble has run to its end, so the settle pop only plays after a reveal. */
  popped: boolean;
  skip(): void;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** A stand-in face near the real total, so the tumble reads as dice rather than a counter. */
function standIn(total: number, previous: number | null): number {
  const span = Math.max(20, Math.abs(total) * 2);
  let value = Math.floor(Math.random() * span) + 1;
  if (value === previous) value = (value % span) + 1;
  return value;
}

/** Drives one reveal per log entry; a new entry mid-tumble restarts on the new one. */
export function useRollReveal(entry: RollLogEntry | null): Reveal {
  const [shown, setShown] = useState<number | null>(entry?.total ?? null);
  const [settled, setSettled] = useState(true);
  const [popped, setPopped] = useState(false);
  const frame = useRef<number | null>(null);
  const total = entry?.total ?? null;

  const stop = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  };

  useEffect(() => {
    stop();
    if (total === null) {
      setShown(null);
      setSettled(true);
      setPopped(false);
      return;
    }
    const fresh = entry !== null && Date.now() - entry.at < REVEAL_MS;
    if (!fresh || prefersReducedMotion()) {
      setShown(total);
      setSettled(true);
      setPopped(false);
      return;
    }
    const start = performance.now();
    let lastFlip = 0;
    let previous: number | null = null;
    setSettled(false);
    setPopped(false);
    setShown((previous = standIn(total, null)));
    const tick = (now: number) => {
      const t = (now - start) / REVEAL_MS;
      if (t >= 1) {
        frame.current = null;
        setShown(total);
        setSettled(true);
        setPopped(true);
        return;
      }
      // The gap between flips grows from 40 ms to about 220 ms as the roll runs out of spin.
      if (now - lastFlip >= 40 + 180 * t * t) {
        lastFlip = now;
        setShown((previous = standIn(total, previous)));
      }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return stop;
    // Keyed on the entry, not its total: two rolls of the same total still each reveal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.id]);

  const skip = useCallback(() => {
    if (frame.current === null) return;
    stop();
    setShown(total);
    setSettled(true);
    setPopped(true);
  }, [total]);

  return { shown, settled, popped, skip };
}

interface Props {
  entry: RollLogEntry | null;
  /** Pass the hook's result when the caller also needs `settled`, for example to hold the faces. */
  reveal?: Reveal;
  className?: string;
  /** Shown when there is no roll yet. */
  placeholder?: string;
}

export function RollReveal({ entry, reveal, className = '', placeholder = '–' }: Props) {
  const own = useRollReveal(reveal ? null : entry);
  const r = reveal ?? own;
  const outcome = r.settled ? entry?.outcome : undefined;
  const classes = [
    'roll-reveal',
    r.settled ? 'settled' : 'tumbling',
    r.popped ? 'popped' : '',
    outcome ?? '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <span
      className={classes}
      data-testid="roll-reveal"
      data-settled={r.settled ? 'true' : 'false'}
      title={r.settled ? undefined : 'Click to settle the roll'}
      onClick={r.settled ? undefined : r.skip}
    >
      {r.settled ? (
        <span>{r.shown ?? placeholder}</span>
      ) : (
        <span aria-hidden="true">{r.shown ?? placeholder}</span>
      )}
    </span>
  );
}

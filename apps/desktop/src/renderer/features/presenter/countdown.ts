import { useEffect, useState } from 'react';

/** Whole seconds left until `endsAt` (an epoch ms), never below zero. */
export function secondsLeft(endsAt: number, now: number): number {
  return Math.max(0, Math.round((endsAt - now) / 1000));
}

/** "9:05" for 545 seconds. */
export function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  return `${m}:${String(seconds % 60).padStart(2, '0')}`;
}

/** The break timer's seconds left, ticking twice a second; null without an end time. */
export function useCountdown(endsAt: number | undefined): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (endsAt === undefined) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [endsAt]);
  return endsAt === undefined ? null : secondsLeft(endsAt, now);
}

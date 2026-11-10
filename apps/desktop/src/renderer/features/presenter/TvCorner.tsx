import { useEffect, useState } from 'react';
import type { LiveCounter, LiveTimer } from '@trifold/api';
import { formatClock, remainingMs } from '@trifold/rules';

/**
 * The player window's bottom-left corner (ADR 0019, ADR 0021): the DM's tracking shown to the
 * table, opposite the round counter. The one timer marked Show on TV sits on top, large; the
 * counters marked for the TV stack under it. Each overlay switch (Timers, Counters) is applied
 * by the caller, which passes null or an empty list for what is switched off.
 *
 * A running timer counts down here from its `endsAt` on this window's own clock, so the console
 * only sends a change when the timer starts, pauses, resets or is edited; it reads 0:00 and
 * turns to its alert look at the moment it ends, whether or not the console has caught up.
 */
export function TvCorner({
  timer,
  counters,
}: {
  timer: LiveTimer | null;
  counters: readonly LiveCounter[];
}) {
  if (!timer && counters.length === 0) return null;
  return (
    <div className="tv-corner" data-testid="tv-corner">
      {timer && <TvTimer timer={timer} />}
      {counters.length > 0 && (
        <ul className="tv-counters" aria-label="Counters" data-testid="tv-counters">
          {counters.map((c) => (
            <li key={c.id} className={`tv-counter${c.bound ? ` at-${c.bound}` : ''}`}>
              <span className="tv-counter-name">{c.name}</span>
              <span className="tv-counter-value">
                {c.value}
                {c.max !== undefined && <span className="tv-counter-max"> / {c.max}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TvTimer({ timer }: { timer: LiveTimer }) {
  const running = timer.status === 'running';
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [running, timer.endsAt]);
  const left = remainingMs(timer, running ? now : 0);
  const done = timer.status === 'done' || (running && left === 0);
  return (
    <div
      className={`tv-timer status-${done ? 'done' : timer.status}`}
      data-testid="tv-timer"
      role="timer"
      aria-label={timer.name}
    >
      <span className="tv-timer-name">{timer.name}</span>
      <span className="tv-timer-clock">{formatClock(left)}</span>
      {done && <span className="tv-timer-alert">Time&rsquo;s up</span>}
    </div>
  );
}

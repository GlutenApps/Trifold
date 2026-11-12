import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { rollAndLog } from '../../stores/dicePoolStore';
import { useRollLogStore, type RollLogEntry } from '../../stores/rollLogStore';
import { Icon } from '../shell/icons';
import { DicePool } from './DicePool';
import { PinButton, PinnedRolls } from './PinnedRolls';
import { RollReveal, useRollReveal } from './RollReveal';

/**
 * The Dice tool (DESIGN.md §6.7), a pop-up above the strip's dice button (ADR 0009): the pool
 * builder, a typed expression for anything the chips cannot say, and the shared roll log. The
 * strip's chips are a mirror of this tool; the modifier, Adv/Dis, typed rolls and the log live
 * only here. Rolling itself is the pool store's `rollAndLog`, re-exported for convenience.
 *
 * The log reads like a chat: oldest at the top, the newest roll at the bottom with the reveal,
 * and the list keeps itself scrolled to the bottom so each new roll lands in view.
 */

export { rollAndLog };

interface DiceRollerProps {
  showLog?: boolean;
  /** Accessible name of the typed-expression field; a second home must pass a distinct one. */
  inputLabel?: string;
}

/** The pool builder with a typed fallback and the shared log (DESIGN.md §6.7). */
export function DiceRoller({ showLog = true, inputLabel = 'Dice expression' }: DiceRollerProps) {
  const entries = useRollLogStore((s) => s.entries);
  const clear = useRollLogStore((s) => s.clear);
  const latest = entries[0] ?? null;
  const reveal = useRollReveal(latest);
  const logRef = useRef<HTMLOListElement>(null);
  // Whether the log sits at its end; scrolling up to read older rolls lets go of it.
  const atEnd = useRef(true);

  // Open at the newest roll, and follow each new one down.
  useLayoutEffect(() => {
    const log = logRef.current;
    if (!log) return;
    log.scrollTop = log.scrollHeight;
    atEnd.current = true;
  }, [latest?.id]);

  // Stay at the end when the log changes size (pins appearing above it, the pop-up resizing).
  useEffect(() => {
    const log = logRef.current;
    if (!log || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (atEnd.current) log.scrollTop = log.scrollHeight;
    });
    observer.observe(log);
    return () => observer.disconnect();
  }, [showLog]);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="dice-roller">
      <DicePool />
      <form
        className="row typed-roll"
        onSubmit={(e) => {
          e.preventDefault();
          if (!input.trim()) return;
          const failed = rollAndLog(input);
          setError(failed);
          if (!failed) setInput('');
        }}
      >
        <span className="muted small">Or type</span>
        <input
          type="text"
          aria-label={inputLabel}
          placeholder="4d6kh3, 2d4x10, d20+5 adv"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit" className="btn" disabled={!input.trim()}>
          Roll typed
        </button>
        {error && <span className="muted small">{error}</span>}
      </form>
      {showLog && (
        <>
          <PinnedRolls />
          <div className="row roll-log-head">
            <h2 className="mt">Roll log</h2>
            <span className="muted small">newest at the bottom</span>
            <span className="spacer" />
            <button
              type="button"
              className="chrome-btn"
              aria-label="Clear roll log"
              title="Clear roll log"
              disabled={entries.length === 0}
              onClick={clear}
            >
              <Icon name="trash" />
            </button>
          </div>
          <ol
            className="roll-log"
            aria-label="Roll log"
            title="Pool, tracker, compendium and save rolls, oldest first"
            ref={logRef}
            onScroll={(e) => {
              const log = e.currentTarget;
              atEnd.current = log.scrollHeight - log.scrollTop - log.clientHeight < 4;
            }}
          >
            {entries
              .slice()
              .reverse()
              .map((e) =>
                e === latest ? (
                  <li
                    key={e.id}
                    className={`roll-entry kind-${e.kind} latest`}
                    data-testid="latest-roll"
                    aria-live="polite"
                  >
                    <RollReveal entry={e} reveal={reveal} className="roll-total" />
                    <RollLabel entry={e} />
                    <span
                      className={`muted roll-faces reveal-detail${reveal.settled ? ' settled' : ''}`}
                    >
                      {e.faces}
                    </span>
                    <span className="muted roll-time">{new Date(e.at).toLocaleTimeString()}</span>
                    <PinButton entry={e} />
                  </li>
                ) : (
                  <li key={e.id} className={`roll-entry kind-${e.kind}`}>
                    <span className="roll-total">{e.total}</span>
                    <RollLabel entry={e} />
                    <span className="muted roll-faces">{e.faces}</span>
                    <span className="muted roll-time">{new Date(e.at).toLocaleTimeString()}</span>
                    <PinButton entry={e} />
                  </li>
                ),
              )}
            {entries.length === 0 && <li className="muted">Pick some dice and roll.</li>}
          </ol>
        </>
      )}
    </div>
  );
}

function RollLabel({ entry }: { entry: RollLogEntry }) {
  return (
    <span className="roll-label">
      <span className={`badge roll-source src-${entry.source}`}>{entry.source}</span> {entry.label}
      {entry.actor ? <span className="muted"> · {entry.actor}</span> : null}
    </span>
  );
}

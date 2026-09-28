import { useState } from 'react';
import { rollAndLog } from '../../stores/dicePoolStore';
import { useRollLogStore } from '../../stores/rollLogStore';
import { DicePool } from './DicePool';

export { rollAndLog };

interface DiceRollerProps {
  showLog?: boolean;
  /** Accessible name of the typed-expression field; the tray uses a distinct one from the panel. */
  inputLabel?: string;
}

/** The pool builder with a typed fallback and the shared log (DESIGN.md §6.7). */
export function DiceRoller({ showLog = true, inputLabel = 'Dice expression' }: DiceRollerProps) {
  const entries = useRollLogStore((s) => s.entries);
  const clear = useRollLogStore((s) => s.clear);
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
        <button type="submit" className="btn small" disabled={!input.trim()}>
          Roll typed
        </button>
        {error && <span className="muted small">{error}</span>}
      </form>
      {showLog && (
        <>
          <div className="row">
            <h2 className="mt">Roll log</h2>
            <span className="muted small">one log: pool, tracker and save rolls</span>
            <span className="spacer" />
            <button type="button" className="btn" disabled={entries.length === 0} onClick={clear}>
              Clear
            </button>
          </div>
          <ol className="roll-log" aria-label="Roll log">
            {entries.map((e) => (
              <li key={e.id} className={`roll-entry kind-${e.kind}`}>
                <span className="roll-total">{e.total}</span>
                <span className="roll-label">
                  <span className={`badge roll-source src-${e.source}`}>{e.source}</span> {e.label}
                  {e.actor ? <span className="muted"> · {e.actor}</span> : null}
                </span>
                <span className="muted roll-faces">{e.faces}</span>
                <span className="muted roll-time">{new Date(e.at).toLocaleTimeString()}</span>
              </li>
            ))}
            {entries.length === 0 && <li className="muted">Nothing rolled yet.</li>}
          </ol>
        </>
      )}
    </div>
  );
}

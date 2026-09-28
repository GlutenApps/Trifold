import { useState } from 'react';
import { parseRollRequest, rollRequest } from '@trifold/rules';
import { facesText, useRollLogStore } from '../../stores/rollLogStore';

const QUICK = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100', '2d6', 'd20 adv', 'd20 dis'];

/** Roller with a shared log (DESIGN.md §6.7). */
export function DicePage() {
  const entries = useRollLogStore((s) => s.entries);
  const add = useRollLogStore((s) => s.add);
  const clear = useRollLogStore((s) => s.clear);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const rollText = (text: string) => {
    const request = parseRollRequest(text);
    if (!request) {
      setError(`Cannot read "${text}". Try 2d6+3, 4d6kh3 or d20 adv.`);
      return;
    }
    setError(null);
    const result = rollRequest(request);
    const modeNote = request.mode === 'normal' ? '' : ` (${request.mode})`;
    add({
      kind: 'dice',
      label: `${request.expression}${modeNote}`,
      expression: request.expression,
      total: result.total,
      faces: facesText(result),
    });
  };

  return (
    <section className="dice">
      <h1>Dice</h1>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim()) rollText(input);
        }}
      >
        <input
          type="text"
          aria-label="Dice expression"
          placeholder="2d6+3, 4d6kh3, d20 adv"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          autoFocus
        />
        <button type="submit" className="btn primary">
          Roll
        </button>
        {error && <span className="muted">{error}</span>}
      </form>
      <div className="row">
        {QUICK.map((q) => (
          <button key={q} type="button" className="btn" onClick={() => rollText(q)}>
            {q}
          </button>
        ))}
      </div>
      <div className="row">
        <h2 className="mt">Roll log</h2>
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
              {e.label}
              {e.actor ? <span className="muted"> · {e.actor}</span> : null}
            </span>
            <span className="muted roll-faces">{e.faces}</span>
            <span className="muted roll-time">{new Date(e.at).toLocaleTimeString()}</span>
          </li>
        ))}
        {entries.length === 0 && <li className="muted">Nothing rolled yet.</li>}
      </ol>
    </section>
  );
}

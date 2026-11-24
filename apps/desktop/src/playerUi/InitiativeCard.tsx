import { useState } from 'react';
import type { CreatureView } from '@trifold/api';

/**
 * The initiative box (PLAYER-CONNECTOR.md, "Initiative"): one number, then it goes. Floats over
 * the top of the map here; the player console puts it in its Initiative tool (PLAYER-MODE.md).
 */
export function InitiativeCard({
  creature,
  onSubmit,
}: {
  creature: CreatureView;
  onSubmit(value: number): void;
}) {
  const [value, setValue] = useState('');
  const ok = /^-?\d{1,2}$/.test(value);
  return (
    <form
      className="pc-initiative"
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) onSubmit(Number(value));
      }}
    >
      <label className="pc-field">
        <span>Roll initiative for {creature.name} and enter what you got</span>
        <input
          inputMode="numeric"
          maxLength={3}
          aria-label="Initiative"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^\d-]/g, '').slice(0, 3))}
        />
      </label>
      <button type="submit" className="pc-btn primary" disabled={!ok}>
        Submit
      </button>
    </form>
  );
}

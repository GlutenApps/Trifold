import { useEffect, useRef, useState } from 'react';
import { applyDamage, applyHealing, type HitPoints } from '@trifold/rules';
import { Icon } from '../shell/icons';

/**
 * HP between fights (ADR 0055): what a PC card or an NPC carries out of the last fight, changed
 * by the DM from its Campaign row without starting one. The chip shows it; pressing it opens the
 * editor under the row, which works like the tracker's: damage comes off temp HP first, healing
 * stops at max, temp HP is set (it does not stack). No dialog.
 */

export function hpText(hp: HitPoints | null): string {
  if (!hp) return 'HP full';
  return `HP ${hp.current}/${hp.max}${hp.temp > 0 ? ` +${hp.temp}` : ''}`;
}

/** The HP chip on a row: its state at a glance, and the way into the editor. */
export function HpChip({
  name,
  hp,
  open,
  onToggle,
}: {
  name: string;
  /** Null when nothing is carried: the creature is at its full stat-block HP. */
  hp: HitPoints | null;
  open: boolean;
  onToggle(): void;
}) {
  const hurt = hp !== null && hp.current < hp.max;
  return (
    <button
      type="button"
      className={`btn small hp-chip${hurt ? ' hurt' : ''}${open ? ' on' : ''}`}
      aria-label={`Change ${name}'s HP`}
      aria-expanded={open}
      title="Damage, heal or set HP between fights"
      onClick={onToggle}
    >
      {hpText(hp)}
    </button>
  );
}

export type HpChange = 'damage' | 'heal' | 'temp' | 'set';

/** The HP after one change, the tracker's rules; `amount` is a whole number of 0 or more. */
export function changeHp(hp: HitPoints, change: HpChange, amount: number): HitPoints {
  const n = Math.max(0, Math.floor(amount));
  switch (change) {
    case 'damage':
      return applyDamage(hp, n).hp;
    case 'heal':
      return applyHealing(hp, n);
    case 'temp':
      return { ...hp, temp: n };
    case 'set':
      return { ...hp, current: Math.min(hp.max, n) };
  }
}

/** The editor under a row: an amount, then Damage, Heal, Temp HP or Set. */
export function HpEditor({
  name,
  hp,
  onApply,
  onClose,
}: {
  name: string;
  hp: HitPoints;
  onApply(next: HitPoints): void;
  onClose(): void;
}) {
  const [amount, setAmount] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const value = Number(amount);
  const ready = amount.trim() !== '' && Number.isFinite(value) && value >= 0;
  const apply = (change: HpChange) => {
    if (!ready) return;
    onApply(changeHp(hp, change, value));
    setAmount('');
    input.current?.focus();
  };

  return (
    <div
      className="hp-editor"
      role="group"
      aria-label={`${name}'s HP`}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <span className="muted small">{hpText(hp)}</span>
      <input
        ref={input}
        type="number"
        className="narrow"
        min={0}
        inputMode="numeric"
        aria-label={`Amount for ${name}`}
        placeholder="0"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') apply(e.shiftKey ? 'heal' : 'damage');
        }}
      />
      <button
        type="button"
        className="btn small danger"
        disabled={!ready}
        onClick={() => apply('damage')}
      >
        Damage
      </button>
      <button type="button" className="btn small" disabled={!ready} onClick={() => apply('heal')}>
        Heal
      </button>
      <button
        type="button"
        className="btn small"
        disabled={!ready}
        title="Set temp HP to this amount (temp HP does not stack)"
        onClick={() => apply('temp')}
      >
        Temp HP
      </button>
      <button
        type="button"
        className="btn small"
        disabled={!ready}
        title="Set current HP to this amount"
        onClick={() => apply('set')}
      >
        Set
      </button>
      <span className="spacer" />
      <button
        type="button"
        className="chrome-btn xs"
        aria-label={`Close ${name}'s HP`}
        title="Close (Escape)"
        onClick={onClose}
      >
        <Icon name="close" />
      </button>
    </div>
  );
}

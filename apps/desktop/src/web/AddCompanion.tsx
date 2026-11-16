import { useMemo, useState } from 'react';
import type { SummonOption } from '@trifold/api';

/**
 * Add a companion (player UI handoff; ADR 0043): the DM's summon list, searchable by name
 * or type. **Add** summons at once with the options last used for that creature on this device
 * (the spec's presets); **Options** opens them: how many, initiative, how long, concentration and
 * whether it stays after the fight.
 */

export interface SummonOptions {
  count: number;
  initiative: 'shared' | 'own';
  /** Rounds in a fight; 0 means until dismissed. */
  rounds: number;
  concentration: boolean;
  persistent: boolean;
}

const DEFAULTS: SummonOptions = {
  count: 1,
  initiative: 'shared',
  rounds: 0,
  concentration: false,
  persistent: false,
};

const storeKey = (key: string) => `trifold:summon:${key}`;

/** Creature types come lower case from the SRD ("beast"). */
export const capitalise = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

export function rememberedOptions(key: string): SummonOptions {
  try {
    const raw = localStorage.getItem(storeKey(key));
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<SummonOptions>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

function remember(key: string, options: SummonOptions): void {
  try {
    localStorage.setItem(storeKey(key), JSON.stringify(options));
  } catch {
    // Private browsing: the defaults come back next time.
  }
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase();

export function AddCompanion({
  options,
  onBack,
  onAdd,
}: {
  options: readonly SummonOption[];
  onBack(): void;
  onAdd(option: SummonOption, chosen: SummonOptions): void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<SummonOptions>(DEFAULTS);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return options.filter(
      (o) => !q || o.name.toLowerCase().includes(q) || o.type.toLowerCase().includes(q),
    );
  }, [options, query]);

  const add = (o: SummonOption, chosen: SummonOptions) => {
    remember(o.key, chosen);
    onAdd(o, chosen);
  };

  return (
    <div className="pc-tool-companions">
      <div className="pc-tool-title">
        <button
          type="button"
          className="pc-round bare"
          aria-label="Back to companions"
          onClick={onBack}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <span>Add a companion</span>
      </div>
      <input
        className="pc-search"
        type="search"
        aria-label="Search creatures"
        placeholder="Search this campaign’s creatures"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="pc-addlist">
        {shown.map((o) => {
          const remembered = rememberedOptions(o.key);
          const expanded = open === o.key;
          return (
            <div key={o.key} className="pc-addrow">
              <div className="pc-comp-row">
                <span className="pc-portrait" style={{ width: 32, height: 32 }} aria-hidden="true">
                  <span>{initials(o.name)}</span>
                </span>
                <span className="pc-comp-text">
                  <span className="pc-comp-name">{o.name}</span>
                  <span className="pc-comp-meta">
                    {capitalise(o.type) || 'Creature'}, AC {o.ac ?? '—'}, HP {o.hp ?? '—'}
                    {remembered.count > 1 ? ` · ×${remembered.count}` : ''}
                  </span>
                </span>
                <button
                  type="button"
                  className="pc-btn ghost small"
                  aria-label={`Options for ${o.name}`}
                  aria-expanded={expanded}
                  onClick={() => {
                    setOpen(expanded ? null : o.key);
                    setDraft(remembered);
                  }}
                >
                  Options
                </button>
                {!expanded && (
                  <button
                    type="button"
                    className="pc-btn primary"
                    aria-label={`Add ${o.name}`}
                    onClick={() => add(o, remembered)}
                  >
                    Add
                  </button>
                )}
              </div>
              {expanded && (
                <SummonOptionsForm
                  value={draft}
                  onChange={setDraft}
                  onSubmit={() => {
                    setOpen(null);
                    add(o, draft);
                  }}
                  name={o.name}
                />
              )}
            </div>
          );
        })}
        {shown.length === 0 && (
          <p className="pc-hint center">
            {options.length
              ? 'No creatures match that search.'
              : 'Your DM hasn’t added any companions yet.'}
          </p>
        )}
      </div>
      <p className="pc-hint small">
        Don’t see it? Ask your DM to add the creature to the campaign.
      </p>
    </div>
  );
}

function SummonOptionsForm({
  value,
  onChange,
  onSubmit,
  name,
}: {
  value: SummonOptions;
  onChange(v: SummonOptions): void;
  onSubmit(): void;
  name: string;
}) {
  const set = (patch: Partial<SummonOptions>) => onChange({ ...value, ...patch });
  return (
    <div className="pc-summon-options">
      <div className="pc-optrow">
        <span>How many</span>
        <div className="pc-stepper small">
          <button
            type="button"
            className="pc-step"
            aria-label="Fewer"
            onClick={() => set({ count: Math.max(1, value.count - 1) })}
          >
            −
          </button>
          <span className="pc-step-value">{value.count}</span>
          <button
            type="button"
            className="pc-step"
            aria-label="More"
            onClick={() => set({ count: Math.min(8, value.count + 1) })}
          >
            +
          </button>
        </div>
      </div>
      <div className="pc-segment" role="group" aria-label="Initiative">
        <button
          type="button"
          aria-pressed={value.initiative === 'shared'}
          onClick={() => set({ initiative: 'shared' })}
        >
          Shares my turn
        </button>
        <button
          type="button"
          aria-pressed={value.initiative === 'own'}
          onClick={() => set({ initiative: 'own' })}
        >
          Rolls its own
        </button>
      </div>
      <div className="pc-optrow">
        <span>Lasts</span>
        <div className="pc-stepper small">
          <button
            type="button"
            className="pc-step"
            aria-label="Fewer rounds"
            onClick={() => set({ rounds: Math.max(0, value.rounds - 1) })}
          >
            −
          </button>
          <span className="pc-step-value wide">
            {value.rounds ? `${value.rounds} rounds` : 'Until dismissed'}
          </span>
          <button
            type="button"
            className="pc-step"
            aria-label="More rounds"
            onClick={() => set({ rounds: Math.min(100, value.rounds + 1) })}
          >
            +
          </button>
        </div>
      </div>
      <label className="pc-check">
        <input
          type="checkbox"
          checked={value.concentration}
          onChange={(e) => set({ concentration: e.target.checked })}
        />
        Tied to my concentration
      </label>
      <label className="pc-check">
        <input
          type="checkbox"
          checked={value.persistent}
          onChange={(e) => set({ persistent: e.target.checked })}
        />
        Stays after the fight
      </label>
      <button type="button" className="pc-btn primary" onClick={onSubmit}>
        Summon {value.count > 1 ? `${value.count} × ` : ''}
        {name}
      </button>
    </div>
  );
}

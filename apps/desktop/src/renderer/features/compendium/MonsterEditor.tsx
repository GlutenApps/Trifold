import { useState } from 'react';
import {
  abilityModifier,
  average,
  isDiceExpression,
  proficiencyBonusForCr,
  xpForCr,
  CR_ORDER,
} from '@trifold/rules';
import type { Feature, MonsterRecord } from '@trifold/schema';

type Data = MonsterRecord['data'];
type FeatureList = 'traits' | 'actions' | 'bonusActions' | 'reactions' | 'lair';

const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
const ABILITY_LABEL: Record<(typeof ABILITIES)[number], string> = {
  str: 'STR',
  dex: 'DEX',
  con: 'CON',
  int: 'INT',
  wis: 'WIS',
  cha: 'CHA',
};
const SIZES: Array<[Data['size'], string]> = [
  ['T', 'Tiny'],
  ['S', 'Small'],
  ['M', 'Medium'],
  ['L', 'Large'],
  ['H', 'Huge'],
  ['G', 'Gargantuan'],
];
const SPEEDS = ['walk', 'fly', 'swim', 'climb', 'burrow'] as const;

function list(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function pairs(value: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of list(value)) {
    const m = /^([A-Za-z ]+?)\s*([+-]?\d+)$/.exec(part);
    if (m) out[m[1]!.trim().toLowerCase()] = Number(m[2]);
  }
  return out;
}

function pairsText(value: Record<string, number>): string {
  return Object.entries(value)
    .map(([k, v]) => `${k} ${v >= 0 ? '+' : ''}${v}`)
    .join(', ');
}

function blankFeature(): Feature {
  return { name: '', displayName: '', text: '', tags: [], attacks: [], rolls: [], saves: [] };
}

function FeatureListEditor({
  label,
  features,
  onChange,
}: {
  label: string;
  features: Feature[];
  onChange(features: Feature[]): void;
}) {
  const update = (i: number, patch: Partial<Feature>) =>
    onChange(features.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const move = (i: number, step: -1 | 1) => {
    const j = i + step;
    if (j < 0 || j >= features.length) return;
    const next = [...features];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  };
  return (
    <fieldset className="feature-list">
      <legend>{label}</legend>
      {features.map((f, i) => (
        <div key={i} className="feature-edit">
          <div className="row">
            <input
              type="text"
              aria-label={`${label} name`}
              placeholder="Name, e.g. Bite or Fire Breath (Recharge 5–6)"
              value={f.name}
              onChange={(e) => update(i, { name: e.target.value, displayName: e.target.value })}
            />
            <button type="button" className="btn tiny" title="Move up" onClick={() => move(i, -1)}>
              ▲
            </button>
            <button type="button" className="btn tiny" title="Move down" onClick={() => move(i, 1)}>
              ▼
            </button>
            <button
              type="button"
              className="btn tiny"
              title="Remove"
              onClick={() => onChange(features.filter((_, j) => j !== i))}
            >
              ✕
            </button>
          </div>
          <textarea
            aria-label={`${label} text`}
            rows={3}
            placeholder="Text. Attack rolls, damage and saving throws are read from it."
            value={f.text}
            onChange={(e) => update(i, { text: e.target.value })}
          />
        </div>
      ))}
      <button
        type="button"
        className="btn tiny"
        onClick={() => onChange([...features, blankFeature()])}
      >
        Add {label.toLowerCase().replace(/s$/, '')}
      </button>
    </fieldset>
  );
}

/** Monster editor for homebrew copies (DESIGN.md §6.2, M1 §7). Originals stay read-only. */
export function MonsterEditor({
  record,
  onSave,
  onCancel,
  saving,
}: {
  record: MonsterRecord;
  onSave(record: MonsterRecord): void;
  onCancel(): void;
  saving: boolean;
}) {
  const [name, setName] = useState(record.displayName);
  const [d, setD] = useState<Data>(record.data);
  const [savesText, setSavesText] = useState(pairsText(d.saves as Record<string, number>));
  const [skillsText, setSkillsText] = useState(pairsText(d.skills));
  const patch = (p: Partial<Data>) => setD((x) => ({ ...x, ...p }));
  const setFeatures = (key: FeatureList, features: Feature[]) =>
    patch({ [key]: features } as Partial<Data>);

  const setCr = (cr: string) => {
    patch({
      cr,
      xp: xpForCr(cr) ?? d.xp,
      proficiencyBonus: proficiencyBonusForCr(cr) ?? d.proficiencyBonus,
    });
  };

  const submit = () => {
    onSave({
      ...record,
      displayName: name,
      name,
      data: {
        ...d,
        saves: pairs(savesText) as Data['saves'],
        skills: pairs(skillsText),
        passivePerception:
          10 +
          abilityModifier(d.abilities.wis) +
          (pairs(skillsText)['perception'] !== undefined
            ? pairs(skillsText)['perception']! - abilityModifier(d.abilities.wis)
            : 0),
      },
    });
  };

  return (
    <form
      className="monster-editor"
      data-testid="monster-editor"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="row">
        <h2>Edit homebrew monster</h2>
        <span className="spacer" />
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn primary" disabled={saving || !name.trim()}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div className="grid-fields">
        <label className="field">
          Name
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="field">
          Size
          <select
            value={d.size ?? ''}
            onChange={(e) => patch({ size: (e.target.value || null) as Data['size'] })}
          >
            <option value="">—</option>
            {SIZES.map(([code, label]) => (
              <option key={code ?? 'none'} value={code ?? ''}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Type
          <input type="text" value={d.type} onChange={(e) => patch({ type: e.target.value })} />
        </label>
        <label className="field">
          Subtype
          <input
            type="text"
            value={d.subtype ?? ''}
            onChange={(e) => patch({ subtype: e.target.value || undefined })}
          />
        </label>
        <label className="field">
          Alignment
          <input
            type="text"
            value={d.alignment}
            onChange={(e) => patch({ alignment: e.target.value })}
          />
        </label>
        <label className="field">
          CR
          <select
            aria-label="Challenge rating"
            value={d.cr}
            onChange={(e) => setCr(e.target.value)}
          >
            {!CR_ORDER.includes(d.cr as (typeof CR_ORDER)[number]) && (
              <option value={d.cr}>{d.cr || '—'}</option>
            )}
            {CR_ORDER.map((cr) => (
              <option key={cr} value={cr}>
                {cr}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          XP
          <input
            type="number"
            value={d.xp}
            onChange={(e) => patch({ xp: Number(e.target.value) || 0 })}
          />
        </label>
        <label className="field">
          Proficiency bonus
          <input
            type="number"
            value={d.proficiencyBonus ?? ''}
            onChange={(e) =>
              patch({
                proficiencyBonus: e.target.value === '' ? undefined : Number(e.target.value),
              })
            }
          />
        </label>
      </div>

      <div className="grid-fields">
        <label className="field">
          AC
          <input
            type="number"
            aria-label="Armor class"
            value={d.ac?.value ?? 10}
            onChange={(e) => patch({ ac: { ...(d.ac ?? {}), value: Number(e.target.value) || 0 } })}
          />
        </label>
        <label className="field">
          AC note
          <input
            type="text"
            value={d.ac?.note ?? ''}
            onChange={(e) =>
              patch({
                ac: {
                  value: d.ac?.value ?? 10,
                  ...(e.target.value ? { note: e.target.value } : {}),
                },
              })
            }
          />
        </label>
        <label className="field">
          HP average
          <input
            type="number"
            aria-label="Hit points"
            value={d.hp?.average ?? 1}
            onChange={(e) =>
              patch({ hp: { ...(d.hp ?? {}), average: Number(e.target.value) || 0 } })
            }
          />
        </label>
        <label className="field">
          HP formula
          <span className="row">
            <input
              type="text"
              aria-label="Hit point formula"
              placeholder="e.g. 4d8+4"
              value={d.hp?.formula ?? ''}
              onChange={(e) =>
                patch({
                  hp: {
                    average: d.hp?.average ?? 1,
                    ...(e.target.value ? { formula: e.target.value } : {}),
                  },
                })
              }
            />
            <button
              type="button"
              className="btn tiny"
              disabled={!d.hp?.formula || !isDiceExpression(d.hp.formula)}
              title="Set the average from the formula"
              onClick={() =>
                d.hp?.formula &&
                patch({ hp: { ...d.hp, average: Math.floor(average(d.hp.formula)) } })
              }
            >
              average
            </button>
          </span>
        </label>
        {SPEEDS.map((s) => (
          <label key={s} className="field">
            Speed {s}
            <input
              type="number"
              value={d.speeds[s] ?? ''}
              onChange={(e) =>
                patch({
                  speeds: {
                    ...d.speeds,
                    [s]: e.target.value === '' ? undefined : Number(e.target.value),
                  },
                })
              }
            />
          </label>
        ))}
      </div>

      <div className="grid-fields abilities">
        {ABILITIES.map((a) => (
          <label key={a} className="field">
            {ABILITY_LABEL[a]}{' '}
            <span className="muted small">
              ({abilityModifier(d.abilities[a]) >= 0 ? '+' : ''}
              {abilityModifier(d.abilities[a])})
            </span>
            <input
              type="number"
              aria-label={ABILITY_LABEL[a]}
              value={d.abilities[a]}
              onChange={(e) =>
                patch({ abilities: { ...d.abilities, [a]: Number(e.target.value) || 0 } })
              }
            />
          </label>
        ))}
      </div>

      <div className="grid-fields">
        <label className="field">
          Saves <span className="muted small">(e.g. dex +4, wis +2)</span>
          <input type="text" value={savesText} onChange={(e) => setSavesText(e.target.value)} />
        </label>
        <label className="field">
          Skills <span className="muted small">(e.g. stealth +6)</span>
          <input type="text" value={skillsText} onChange={(e) => setSkillsText(e.target.value)} />
        </label>
        <label className="field">
          Senses
          <input type="text" value={d.senses} onChange={(e) => patch({ senses: e.target.value })} />
        </label>
        <label className="field">
          Languages
          <input
            type="text"
            value={d.languages}
            onChange={(e) => patch({ languages: e.target.value })}
          />
        </label>
        <label className="field">
          Damage vulnerabilities
          <input
            type="text"
            value={d.damageVulnerabilities.join(', ')}
            onChange={(e) => patch({ damageVulnerabilities: list(e.target.value) })}
          />
        </label>
        <label className="field">
          Damage resistances
          <input
            type="text"
            value={d.damageResistances.join(', ')}
            onChange={(e) => patch({ damageResistances: list(e.target.value) })}
          />
        </label>
        <label className="field">
          Damage immunities
          <input
            type="text"
            value={d.damageImmunities.join(', ')}
            onChange={(e) => patch({ damageImmunities: list(e.target.value) })}
          />
        </label>
        <label className="field">
          Condition immunities
          <input
            type="text"
            value={d.conditionImmunities.join(', ')}
            onChange={(e) => patch({ conditionImmunities: list(e.target.value) })}
          />
        </label>
        <label className="field">
          Environment
          <input
            type="text"
            value={d.environment.join(', ')}
            onChange={(e) => patch({ environment: list(e.target.value) })}
          />
        </label>
        <label className="field">
          Legendary actions per turn
          <input
            type="number"
            min={0}
            value={d.legendary.perTurn ?? ''}
            onChange={(e) =>
              patch({
                legendary: {
                  ...d.legendary,
                  perTurn: e.target.value === '' ? undefined : Number(e.target.value),
                },
              })
            }
          />
        </label>
        <label className="field inline">
          <input
            type="checkbox"
            checked={d.isNpc}
            onChange={(e) => patch({ isNpc: e.target.checked })}
          />
          Named NPC
        </label>
      </div>

      <label className="field">
        Description
        <textarea
          rows={3}
          value={d.description ?? ''}
          onChange={(e) => patch({ description: e.target.value || undefined })}
        />
      </label>

      <FeatureListEditor
        label="Traits"
        features={d.traits}
        onChange={(f) => setFeatures('traits', f)}
      />
      <FeatureListEditor
        label="Actions"
        features={d.actions}
        onChange={(f) => setFeatures('actions', f)}
      />
      <FeatureListEditor
        label="Bonus actions"
        features={d.bonusActions}
        onChange={(f) => setFeatures('bonusActions', f)}
      />
      <FeatureListEditor
        label="Reactions"
        features={d.reactions}
        onChange={(f) => setFeatures('reactions', f)}
      />
      <FeatureListEditor
        label="Legendary actions"
        features={d.legendary.actions}
        onChange={(f) => patch({ legendary: { ...d.legendary, actions: f } })}
      />
      <FeatureListEditor
        label="Lair actions"
        features={d.lair}
        onChange={(f) => setFeatures('lair', f)}
      />

      <div className="row">
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn primary" disabled={saving || !name.trim()}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}

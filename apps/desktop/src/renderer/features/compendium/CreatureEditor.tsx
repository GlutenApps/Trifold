import { useEffect, useState } from 'react';
import { normalizeKey } from '@trifold/rules';
import type { CompendiumRecord } from '@trifold/schema';
import { applyScope } from '../encounters/creatureEdits';
import { useCampaignStore } from '../../stores/campaignStore';
import { useCombatStore } from '../../stores/combatStore';
import { Icon } from '../shell/icons';
import {
  goesToLibrary,
  homeChoices,
  rehome,
  scopeChoices,
  type CampaignView,
  type Choice,
  type EditOrigin,
  type Home,
  type Original,
  type Scope,
} from './creatureSave';
import { EditorHeadContext } from './editorParts';
import { HomebrewEditor } from './RecordEditor';

/**
 * One editor for a record wherever Edit was pressed (ADR 0035): the compendium's record page,
 * a builder row, a fighter in the tracker. It is the kind's own editor; pressing Save does not
 * write yet but turns the pinned header into the Save step, which asks only what applies: the
 * name, where it lives, and where to use it. Confirm writes and carries it out; Back returns to
 * the form with nothing lost. No modal (CLAUDE.md UI conventions).
 */
export function CreatureEditor({
  record,
  own,
  original,
  origin,
  title,
  onCancel,
  onSaved,
}: {
  /** What the editor opens: a copy not yet written, or one of the DM's own records. */
  record: CompendiumRecord;
  /** The DM's own record, edited in place unless they choose Save as new. */
  own: boolean;
  /** What the record replaces when used more widely; null for a blank record. */
  original: Original | null;
  origin: EditOrigin;
  title: string;
  onCancel(): void;
  onSaved(saved: CompendiumRecord): void;
}) {
  const current = useCampaignStore((s) => s.current);
  const fightId = useCombatStore((s) => s.encounterId);
  const fight = useCombatStore((s) => s.state);
  const [pending, setPending] = useState<CompendiumRecord | null>(null);
  const [name, setName] = useState('');
  const [home, setHome] = useState<Home | null>(null);
  const [scope, setScope] = useState<Scope | null>(null);
  const [conflict, setConflict] = useState<{ where: string; suggestion: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const campaign: CampaignView | null = current
    ? {
        slug: current.campaign.slug,
        name: current.campaign.name,
        encounters: current.encounters,
        scenes: current.scenes,
      }
    : null;
  const live = fightId && fight ? { encounterId: fightId, combatants: fight.combatants } : null;
  const homes = homeChoices(own, campaign);
  const chosenHome = home ?? homes[0]?.id ?? 'library';
  const scopes =
    pending && pending.kind === 'monster'
      ? scopeChoices(origin, chosenHome, original, campaign, live)
      : [];
  const chosenScope: Scope =
    scope && scopes.some((s) => s.id === scope) ? scope : (scopes[0]?.id ?? 'none');

  // A name listed in the Library's compendium must not be one it already has.
  const toLibrary = pending ? goesToLibrary(pending, chosenHome) : false;
  useEffect(() => {
    setConflict(null);
    if (!pending || !toLibrary || !name.trim()) return;
    let live = true;
    const kind = pending.kind;
    const keepId = chosenHome === 'update' ? pending.id : null;
    const takenBy = async (key: string) =>
      (await window.trifold.compendium.findByKey(kind, key)).filter((r) => r.id !== keepId);
    void (async () => {
      const clash = await takenBy(normalizeKey(name));
      if (!live || clash.length === 0) return;
      let suggestion = name.trim();
      for (let n = 2; n < 50; n++) {
        const candidate = `${name.trim()} ${n}`;
        if ((await takenBy(normalizeKey(candidate))).length === 0) {
          suggestion = candidate;
          break;
        }
      }
      if (live) setConflict({ where: clash[0]!.sourceBook || clash[0]!.sourceId, suggestion });
    })();
    return () => {
      live = false;
    };
  }, [pending, toLibrary, name, chosenHome]);

  const confirm = async () => {
    if (!pending || !name.trim() || conflict) return;
    setSaving(true);
    setError(null);
    try {
      const named = { ...pending, name: name.trim(), displayName: name.trim() };
      const saved = await window.trifold.homebrew.save(rehome(named, chosenHome, campaign));
      // Save as new from one of the DM's own records replaces that record where it is used.
      const from: Original | null =
        chosenHome === 'new'
          ? {
              identity: { id: record.id, sourceId: record.sourceId, key: record.key },
              name: record.displayName,
            }
          : original;
      await applyScope(chosenScope, origin, from, saved);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  const step = pending ? (
    <div className="save-step" aria-label="Save">
      <div className="row">
        <button
          type="button"
          className="chrome-btn"
          aria-label="Back to editing"
          title="Back to editing"
          onClick={() => setPending(null)}
        >
          <Icon name="left" />
        </button>
        <h2>Save {name.trim() || 'it'}</h2>
        <span className="spacer" />
        <button
          type="button"
          className="btn primary"
          disabled={saving || !name.trim() || !!conflict}
          onClick={() => void confirm()}
        >
          {saving ? 'Saving…' : 'Confirm'}
        </button>
      </div>
      <label className="field">
        Name
        <input
          type="text"
          aria-label="Name to save"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      {conflict && (
        <p className="save-step-warn" role="alert">
          “{name.trim()}” is already in {conflict.where}; records with one name share a row in the
          compendium, so only one would show.{' '}
          <button type="button" className="btn small" onClick={() => setName(conflict.suggestion)}>
            Use “{conflict.suggestion}”
          </button>
        </p>
      )}
      {homes.length > 1 && (
        <ChoiceGroup<Home>
          legend="Keep it"
          choices={homes}
          value={chosenHome}
          onChange={(id) => setHome(id)}
        />
      )}
      {scopes.length > 0 && (
        <ChoiceGroup<Scope>
          legend="Use it"
          choices={scopes}
          value={chosenScope}
          onChange={(id) => setScope(id)}
        />
      )}
      {error && (
        <p className="save-step-warn" role="alert">
          {error}
        </p>
      )}
    </div>
  ) : undefined;

  return (
    <EditorHeadContext.Provider value={{ title, ...(step ? { step } : {}) }}>
      <HomebrewEditor
        record={record}
        isNew={!own}
        saving={saving}
        onCancel={onCancel}
        onSave={(r) => {
          setPending(r);
          setName(r.displayName);
        }}
      />
    </EditorHeadContext.Provider>
  );
}

function ChoiceGroup<T extends string>({
  legend,
  choices,
  value,
  onChange,
}: {
  legend: string;
  choices: readonly Choice<T>[];
  value: T;
  onChange(id: T): void;
}) {
  return (
    <fieldset className="save-step-choices">
      <legend>{legend}</legend>
      {choices.map((c) => (
        <label key={c.id} className="draft-choice">
          <input
            type="radio"
            name={legend}
            checked={value === c.id}
            onChange={() => onChange(c.id)}
          />
          <span>
            {c.label}
            {c.detail && <span className="muted small"> {c.detail}</span>}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

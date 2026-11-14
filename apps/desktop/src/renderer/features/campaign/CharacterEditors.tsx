import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { CompendiumRow } from '@trifold/api';
import type { MonsterRecord, NPC, PCCard, RecordRef } from '@trifold/schema';
import { MonsterFields } from '../compendium/MonsterEditor';
import { InlineConfirm } from '../shell/InlineConfirm';
import {
  Check,
  NumberField,
  Section,
  TextBlock,
  TextField,
  type Cols,
} from '../compendium/editorParts';
import { Icon } from '../shell/icons';

/**
 * The PC card and NPC forms (DESIGN.md §6.3, §10 Bugs) and the "From another campaign…"
 * picker. Both forms share one pattern, the homebrew editors' titled sections (ADR 0027): a short
 * Required section first, then Optional sections folded on a new card and opened on edit when
 * they hold something, so skipping them is plainly fine. Save and add another keeps a new form
 * open and blank, the quick way to enter a party.
 */

const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;

/** An Optional section: folded or open, its title saying it can be skipped. */
function FoldSection({
  title,
  open,
  onToggle,
  cols = 3,
  children,
}: {
  title: string;
  open: boolean;
  onToggle(open: boolean): void;
  cols?: Cols;
  children: ReactNode;
}) {
  return (
    <details
      className="editor-section fold-section"
      open={open}
      onToggle={(e) => {
        const next = (e.currentTarget as HTMLDetailsElement).open;
        if (next !== open) onToggle(next);
      }}
    >
      <summary aria-label={`${title}, optional`}>
        <Icon name={open ? 'down' : 'right'} />
        <h3>{title}</h3>
        <span className="muted small">Optional</span>
      </summary>
      <div className={`editor-grid cols-${cols}`}>{children}</div>
    </details>
  );
}

/** The sticky header of both forms: title, Cancel, Save and add another (new only), Save. */
function FormHead({
  title,
  canSave,
  onCancel,
  onSaveAnother,
}: {
  title: string;
  canSave: boolean;
  onCancel(): void;
  onSaveAnother?: () => void;
}) {
  return (
    <div className="row editor-head">
      <h2>{title}</h2>
      <span className="spacer" />
      <button type="button" className="btn" onClick={onCancel}>
        Cancel
      </button>
      {onSaveAnother && (
        <button type="button" className="btn" disabled={!canSave} onClick={onSaveAnother}>
          Save and add another
        </button>
      )}
      <button type="submit" className="btn primary" disabled={!canSave}>
        Save
      </button>
    </div>
  );
}

// ---------- PC card ----------

/** A PC card while it is being typed: Max HP and AC stay empty until the DM fills them. */
type PcDraft = Omit<PCCard, 'maxHp' | 'ac'> & { maxHp?: number; ac?: number };

/** A blank card for the form: no id (main assigns one), nothing invented for HP or AC. */
export function blankPc(): PCCard {
  return {
    schemaVersion: 1,
    id: '',
    name: '',
    playerName: '',
    classText: '',
    level: 1,
    // Placeholders only: the form clears these, so Save waits for real numbers.
    maxHp: 0,
    ac: 0,
    initiativeBonus: 0,
    speed: 30,
    passives: { perception: 10, insight: 10, investigation: 10 },
    saves: {},
    notes: '',
    createdAt: '',
    updatedAt: '',
  };
}

const int = (value: number | undefined, fallback: number) =>
  value === undefined || !Number.isFinite(value) ? fallback : Math.trunc(value);

export function PcEditor({
  pc,
  onSave,
  onCancel,
}: {
  pc: PCCard;
  /** `another`: the DM asked for a fresh form after this one. */
  onSave(pc: PCCard, another: boolean): void;
  onCancel(): void;
}) {
  const isNew = !pc.id;
  const [draft, setDraft] = useState<PcDraft>(() =>
    isNew ? { ...pc, maxHp: undefined, ac: undefined } : pc,
  );
  const [open, setOpen] = useState(() => ({
    basics:
      !isNew &&
      Boolean(
        pc.playerName || pc.classText || pc.level > 1 || pc.initiativeBonus || pc.speed !== 30,
      ),
    senses:
      !isNew &&
      (pc.passives.perception !== 10 ||
        pc.passives.insight !== 10 ||
        pc.passives.investigation !== 10),
    combat:
      !isNew &&
      (pc.spellSaveDc !== undefined ||
        Object.keys(pc.saves).length > 0 ||
        pc.currentHp !== undefined ||
        (pc.tempHp ?? 0) > 0),
    notes: !isNew && pc.notes.trim() !== '',
  }));
  const patch = (p: Partial<PcDraft>) => setDraft((d) => ({ ...d, ...p }));
  const passives = (p: Partial<PCCard['passives']>) =>
    setDraft((d) => ({ ...d, passives: { ...d.passives, ...p } }));
  const canSave =
    draft.name.trim() !== '' &&
    draft.maxHp !== undefined &&
    draft.maxHp >= 1 &&
    draft.ac !== undefined;

  const save = (another: boolean) => {
    if (!canSave) return;
    onSave(
      {
        ...draft,
        name: draft.name.trim(),
        maxHp: int(draft.maxHp, 1),
        ac: int(draft.ac, 10),
        level: Math.min(20, Math.max(1, int(draft.level, 1))),
      },
      another,
    );
  };

  return (
    <form
      className="record-editor character-editor"
      aria-label={isNew ? 'New PC card' : `Edit ${pc.name}`}
      onSubmit={(e) => {
        e.preventDefault();
        save(false);
      }}
    >
      <FormHead
        title={isNew ? 'New PC card' : `Edit ${pc.name}`}
        canSave={canSave}
        onCancel={onCancel}
        {...(isNew ? { onSaveAnother: () => save(true) } : {})}
      />
      <Section title="Required" cols={3} hint="Everything below is optional and can wait.">
        <TextField label="Name" required value={draft.name} onChange={(name) => patch({ name })} />
        <NumberField
          label="Max HP"
          min={1}
          value={draft.maxHp}
          onChange={(maxHp) => patch({ maxHp })}
        />
        <NumberField label="AC" value={draft.ac} onChange={(ac) => patch({ ac })} />
      </Section>
      <FoldSection
        title="Basics"
        open={open.basics}
        onToggle={(o) => setOpen({ ...open, basics: o })}
      >
        <TextField
          label="Player"
          value={draft.playerName}
          onChange={(playerName) => patch({ playerName })}
        />
        <TextField
          label="Class"
          value={draft.classText}
          onChange={(classText) => patch({ classText })}
        />
        <NumberField
          label="Level"
          min={1}
          value={draft.level}
          onChange={(v) => patch({ level: int(v, 1) })}
        />
        <NumberField
          label="Initiative bonus"
          value={draft.initiativeBonus}
          onChange={(v) => patch({ initiativeBonus: int(v, 0) })}
        />
        <NumberField
          label="Speed"
          min={0}
          value={draft.speed}
          onChange={(v) => patch({ speed: int(v, 30) })}
        />
      </FoldSection>
      <FoldSection
        title="Senses"
        open={open.senses}
        onToggle={(o) => setOpen({ ...open, senses: o })}
      >
        <NumberField
          label="Passive Perception"
          value={draft.passives.perception}
          onChange={(v) => passives({ perception: int(v, 10) })}
        />
        <NumberField
          label="Passive Insight"
          value={draft.passives.insight}
          onChange={(v) => passives({ insight: int(v, 10) })}
        />
        <NumberField
          label="Passive Investigation"
          value={draft.passives.investigation}
          onChange={(v) => passives({ investigation: int(v, 10) })}
        />
      </FoldSection>
      <FoldSection
        title="Combat"
        cols={6}
        open={open.combat}
        onToggle={(o) => setOpen({ ...open, combat: o })}
      >
        <NumberField
          label="Spell save DC"
          value={draft.spellSaveDc}
          onChange={(v) => {
            const { spellSaveDc: _drop, ...rest } = draft;
            setDraft(v === undefined ? rest : { ...rest, spellSaveDc: int(v, 10) });
          }}
        />
        {!isNew && (
          <NumberField
            label="Current HP"
            min={0}
            value={draft.currentHp}
            onChange={(v) => {
              const { currentHp: _was, ...rest } = draft;
              setDraft(v === undefined ? rest : { ...rest, currentHp: Math.max(0, int(v, 0)) });
            }}
          />
        )}
        {!isNew && (
          <NumberField
            label="Temp HP"
            min={0}
            value={draft.tempHp}
            onChange={(v) => {
              const { tempHp: _was, ...rest } = draft;
              setDraft(v === undefined ? rest : { ...rest, tempHp: Math.max(0, int(v, 0)) });
            }}
          />
        )}
        <h4 className="editor-subhead span-all">Saving throws</h4>
        {ABILITIES.map((a) => (
          <NumberField
            key={a}
            label={a.toUpperCase()}
            ariaLabel={`${a.toUpperCase()} save`}
            value={draft.saves[a]}
            onChange={(v) => {
              const saves = { ...draft.saves };
              if (v === undefined) delete saves[a];
              else saves[a] = int(v, 0);
              patch({ saves });
            }}
          />
        ))}
      </FoldSection>
      <FoldSection
        title="Notes"
        cols={1}
        open={open.notes}
        onToggle={(o) => setOpen({ ...open, notes: o })}
      >
        <TextBlock
          label="Notes"
          rows={4}
          value={draft.notes}
          onChange={(notes) => patch({ notes })}
        />
      </FoldSection>
    </form>
  );
}

// ---------- NPC ----------

export function blankNpc(): NPC {
  return {
    schemaVersion: 1,
    id: '',
    name: '',
    role: '',
    location: '',
    notes: '',
    isAlive: true,
    createdAt: '',
    updatedAt: '',
  };
}

/** Picks a compendium creature for an NPC's stat block, or shows and clears the linked one. */
function StatBlockPicker({
  value,
  dirty = false,
  onChange,
}: {
  value: RecordRef | undefined;
  /** The stat block below has unsaved changes, so Unlink asks first. */
  dirty?: boolean;
  onChange(ref: RecordRef | undefined): void;
}) {
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<CompendiumRow[]>([]);

  useEffect(() => {
    if (!value) {
      setName(null);
      return;
    }
    let live = true;
    void window.trifold.compendium
      .get(value.recordId)
      .catch(() => null)
      .then((record) => {
        if (live) setName(record ? record.name : null);
      });
    return () => {
      live = false;
    };
  }, [value]);

  useEffect(() => {
    if (!query.trim()) {
      setRows([]);
      return;
    }
    let live = true;
    void window.trifold.compendium
      .search({ kind: 'monster', text: query, limit: 8, collapse: false })
      .then((r) => live && setRows(r.rows))
      .catch(() => live && setRows([]));
    return () => {
      live = false;
    };
  }, [query]);

  if (value) {
    if (confirmUnlink) {
      return (
        <div className="span-all">
          <InlineConfirm
            name={name ?? value.key}
            question="Unlink this stat block and drop your changes to it?"
            verb="Unlink"
            onConfirm={() => {
              setConfirmUnlink(false);
              onChange(undefined);
            }}
            onKeep={() => setConfirmUnlink(false)}
          />
        </div>
      );
    }
    return (
      <div className="row span-all">
        <span>
          {name ?? value.key}
          {!name && <span className="muted small"> (not in the compendium)</span>}
        </span>
        <button
          type="button"
          className="chrome-btn xs"
          aria-label="Unlink stat block"
          title="Unlink stat block"
          onClick={() => (dirty ? setConfirmUnlink(true) : onChange(undefined))}
        >
          <Icon name="close" />
        </button>
      </div>
    );
  }
  return (
    <div className="span-all">
      <input
        type="text"
        aria-label="Find a stat block"
        placeholder="Find a creature in the compendium…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {rows.length > 0 && (
        <ul className="picker-list">
          {rows.map((row) => (
            <li key={row.id}>
              <span>
                {row.displayName}{' '}
                <span className="muted small">
                  {[row.cr ? `CR ${row.cr}` : '', row.sourceName].filter(Boolean).join(' · ')}
                </span>
              </span>
              <button
                type="button"
                className="chrome-btn xs"
                aria-label={`Use ${row.displayName}`}
                title="Use this stat block"
                onClick={() => {
                  setQuery('');
                  onChange({
                    recordId: row.id,
                    sourceId: row.sourceId,
                    key: row.key,
                    edition: row.edition as RecordRef['edition'],
                  });
                }}
              >
                <Icon name="plus" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A changed stat block waiting for the NPC's Save: the record opened, and as edited. */
export interface StatBlockEdit {
  original: MonsterRecord;
  edited: MonsterRecord;
  /** Updated where it is, as the form's note said; else copied into this campaign. */
  inPlace: boolean;
}

/** The linked stat block, loaded for the form: undefined while loading, null when not found. */
function useLinkedMonster(recordId: string | undefined): MonsterRecord | null | undefined {
  const [record, setRecord] = useState<MonsterRecord | null | undefined>(undefined);
  useEffect(() => {
    if (!recordId) {
      setRecord(null);
      return;
    }
    let live = true;
    setRecord(undefined);
    void window.trifold.compendium
      .get(recordId)
      .catch(() => null)
      .then((found) => {
        if (live) setRecord(found?.kind === 'monster' ? found : null);
      });
    return () => {
      live = false;
    };
  }, [recordId]);
  return record;
}

/**
 * The NPC form (ADR 0039): the NPC first, then its stat block's own sections, so one pencil
 * edits both and scaling is a scroll away. Save hands up the stat block only when it changed.
 */
export function NpcEditor({
  npc,
  onSave,
  onCancel,
  saving = false,
  error = null,
  inPlace = true,
}: {
  npc: NPC;
  onSave(npc: NPC, another: boolean, statBlock: StatBlockEdit | null): void;
  onCancel(): void;
  saving?: boolean;
  error?: string | null;
  /** Whether a changed stat block is updated where it is (else copied into this campaign). */
  inPlace?: boolean;
}) {
  const isNew = !npc.id;
  const [draft, setDraft] = useState<NPC>(npc);
  const [open, setOpen] = useState(() => ({
    basics: !isNew && Boolean(npc.role || npc.location || !npc.isAlive),
    statBlock: !isNew && npc.recordRef !== undefined,
    notes: !isNew && npc.notes.trim() !== '',
  }));
  const linked = useLinkedMonster(draft.recordRef?.recordId);
  const [edit, setEdit] = useState<{ edited: MonsterRecord; dirty: boolean } | null>(null);
  const dirty = !!edit?.dirty;
  // A stat block linked in this form is not the one the NPC had: a change to it is always copied.
  const linkedHere = draft.recordRef?.recordId !== npc.recordRef?.recordId;
  const patch = (p: Partial<NPC>) => setDraft((d) => ({ ...d, ...p }));
  const canSave = draft.name.trim() !== '' && !saving && (!dirty || !!edit?.edited.name.trim());
  const save = (another: boolean) => {
    if (!canSave) return;
    const statBlock =
      linked && edit?.dirty
        ? { original: linked, edited: edit.edited, inPlace: inPlace && !linkedHere }
        : null;
    onSave({ ...draft, name: draft.name.trim() }, another, statBlock);
  };
  const setLink = (recordRef: RecordRef | undefined) => {
    const { recordRef: _was, ...rest } = draft;
    setEdit(null);
    setDraft(recordRef ? { ...rest, recordRef } : rest);
  };

  return (
    <form
      className="record-editor character-editor"
      aria-label={isNew ? 'New NPC' : `Edit ${npc.name}`}
      onSubmit={(e) => {
        e.preventDefault();
        save(false);
      }}
    >
      <FormHead
        title={isNew ? 'New NPC' : `Edit ${npc.name}`}
        canSave={canSave}
        onCancel={onCancel}
        {...(isNew ? { onSaveAnother: () => save(true) } : {})}
      />
      {error && (
        <div className="banner error" role="alert">
          <span>{error}</span>
        </div>
      )}
      <Section title="Required" cols={1} hint="Everything below is optional and can wait.">
        <TextField label="Name" required value={draft.name} onChange={(name) => patch({ name })} />
      </Section>
      <FoldSection
        title="Basics"
        cols={2}
        open={open.basics}
        onToggle={(o) => setOpen({ ...open, basics: o })}
      >
        <TextField
          label="Role"
          placeholder="Village reeve"
          value={draft.role}
          onChange={(role) => patch({ role })}
        />
        <TextField
          label="Location"
          value={draft.location}
          onChange={(location) => patch({ location })}
        />
        <div className="span-all">
          <Check label="Alive" checked={draft.isAlive} onChange={(isAlive) => patch({ isAlive })} />
        </div>
      </FoldSection>
      <FoldSection
        title="Notes"
        cols={1}
        open={open.notes}
        onToggle={(o) => setOpen({ ...open, notes: o })}
      >
        <TextBlock
          label="Notes"
          rows={4}
          value={draft.notes}
          onChange={(notes) => patch({ notes })}
        />
      </FoldSection>
      <FoldSection
        title="Stat block"
        cols={1}
        open={open.statBlock}
        onToggle={(o) => setOpen({ ...open, statBlock: o })}
      >
        <StatBlockPicker value={draft.recordRef} dirty={dirty} onChange={setLink} />
        {linked && (
          <p className="muted small span-all" data-testid="statblock-home-note">
            {inPlace && !linkedHere
              ? 'Changes below update this NPC’s stat block, kept in this campaign.'
              : 'Changes below make a copy for this NPC in this campaign; the original stays as it is.'}
          </p>
        )}
      </FoldSection>
      {open.statBlock && linked && (
        <div className="npc-statblock-fields" data-testid="npc-statblock-editor">
          <MonsterFields
            key={linked.id}
            record={linked}
            nameLabel="Stat block name"
            onChange={(edited, isDirty) => setEdit({ edited, dirty: isDirty })}
          />
        </div>
      )}
    </form>
  );
}

// ---------- From another campaign ----------

export interface CopyRow {
  campaignId: string;
  campaignName: string;
  id: string;
  name: string;
  detail: string;
}

/** Every PC or NPC in the Library's other campaigns, by name; null while loading. */
export function useOtherCampaignRows(
  kind: 'pc' | 'npc',
  currentCampaignId: string,
): CopyRow[] | null {
  const [rows, setRows] = useState<CopyRow[] | null>(null);
  useEffect(() => {
    let live = true;
    void window.trifold.campaigns
      .bundles()
      .catch(() => [])
      .then((bundles) => {
        if (!live) return;
        const out: CopyRow[] = [];
        for (const b of bundles) {
          if (b.campaign.id === currentCampaignId) continue;
          const base = { campaignId: b.campaign.id, campaignName: b.campaign.name };
          if (kind === 'pc') {
            for (const pc of b.pcs) {
              const cls = [pc.classText, pc.classText ? pc.level : ''].filter(Boolean).join(' ');
              out.push({ ...base, id: pc.id, name: pc.name, detail: cls });
            }
          } else {
            for (const npc of b.npcs) {
              out.push({ ...base, id: npc.id, name: npc.name, detail: npc.role });
            }
          }
        }
        setRows(out.sort((a, b) => a.name.localeCompare(b.name)));
      });
    return () => {
      live = false;
    };
  }, [kind, currentCampaignId]);
  return rows;
}

/**
 * Lists the PCs or NPCs of every other campaign in the Library, to copy one into this campaign.
 * The copy is made in main (a new id, its portrait copied) and is independent afterwards.
 */
export function CopyFromCampaign({
  kind,
  currentCampaignId,
  onCopy,
  onBack,
}: {
  kind: 'pc' | 'npc';
  currentCampaignId: string;
  onCopy(campaignId: string, id: string): void;
  onBack(): void;
}) {
  const rows = useOtherCampaignRows(kind, currentCampaignId);
  const [query, setQuery] = useState('');
  const what = kind === 'pc' ? 'PC' : 'NPC';
  const back = kind === 'pc' ? 'Back to party' : 'Back to NPCs';

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? []).filter(
      (r) => !q || r.name.toLowerCase().includes(q) || r.campaignName.toLowerCase().includes(q),
    );
  }, [rows, query]);

  return (
    <div className="copy-from-campaign" aria-label={`Copy a ${what} from another campaign`}>
      <div className="row">
        <button
          type="button"
          className="chrome-btn"
          aria-label={back}
          title={back}
          onClick={onBack}
        >
          <Icon name="left" />
        </button>
        <h2>Copy a {what} from another campaign</h2>
      </div>
      <p className="muted">
        The copy is independent: changing it here leaves the original alone.
        {kind === 'npc' ? ' It comes back alive, with full HP.' : ' It starts at full HP.'}
      </p>
      <input
        type="text"
        aria-label={`Find a ${what}`}
        placeholder="Find by name or campaign…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {rows === null ? (
        <p className="muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="muted">No other campaign has {kind === 'pc' ? 'PC cards' : 'NPCs'} yet.</p>
      ) : shown.length === 0 ? (
        <p className="muted">Nothing matches.</p>
      ) : (
        <ul className="picker-list">
          {shown.map((r) => (
            <li key={`${r.campaignId}/${r.id}`} data-testid="copy-row">
              <span>
                <strong>{r.name}</strong>{' '}
                <span className="muted small">
                  {[r.detail, r.campaignName].filter(Boolean).join(' · ')}
                </span>
              </span>
              <button
                type="button"
                className="chrome-btn xs"
                aria-label={`Copy ${r.name} from ${r.campaignName}`}
                title="Copy into this campaign"
                onClick={() => onCopy(r.campaignId, r.id)}
              >
                <Icon name="plus" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

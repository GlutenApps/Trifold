import { Fragment, useEffect, useMemo, useState } from 'react';
import type { CompendiumRecord, Roll } from '@trifold/schema';
import { useRollLogStore } from '../../stores/rollLogStore';
import { InlineConfirm } from '../shell/InlineConfirm';
import { RollReveal, useRollReveal } from '../dice/RollReveal';
import { Icon } from '../shell/icons';
import { compendiumActions, logDiceRoll } from './compendiumRolls';
import { itemTypeName } from './formatting';
import { diffRecords, type DiffLine } from './recordDiff';
import { StatBlock } from './StatBlock';

/**
 * One open compendium record (DESIGN.md §6.1): a bar with Back, the edition switch and the
 * source citation, then either the record laid out by kind (monsters as the 2024 stat block)
 * or its source text with any unknown elements the importer preserved. Rolls made from the
 * record land in the shared log through compendiumRolls; the homebrew bar (DESIGN.md §6.2) is
 * for monsters only in M1.
 */
interface Props {
  record: CompendiumRecord;
  editions: CompendiumRecord[];
  canGoBack: boolean;
  /** The name of the record Back returns to, for its tooltip and accessible name. */
  backTo?: string;
  onBack(): void;
  /** Returns to the results list in a narrow panel, where the list and the record take turns. */
  onBackToResults?(): void;
  onSwitchEdition(record: CompendiumRecord): void;
  onOpenSpell(key: string): void;
  /** Source names by id, used to tell apart editions that come from different sources. */
  sourceNames?: Record<string, string>;
  homebrew?: {
    onDuplicate(): void;
    onEdit(): void;
    onRemove(recordId: string): void;
  };
}

/** Duplicate / Edit / Delete / Changes (DESIGN.md §6.2). Monsters only in M1. */
function HomebrewBar({
  record,
  actions,
}: {
  record: CompendiumRecord;
  actions: NonNullable<Props['homebrew']>;
}) {
  const [confirm, setConfirm] = useState(false);
  const [diff, setDiff] = useState<DiffLine[] | null>(null);
  const isHomebrew = record.sourceId === 'homebrew';
  useEffect(() => {
    setConfirm(false);
    setDiff(null);
  }, [record.id]);
  if (record.kind !== 'monster') return null;
  const showDiff = async () => {
    if (diff) {
      setDiff(null);
      return;
    }
    const original = record.basedOn
      ? await window.trifold.compendium.get(record.basedOn.recordId)
      : null;
    setDiff(original ? diffRecords(original, record) : []);
  };
  return (
    <div className="homebrew-bar" data-testid="homebrew-bar">
      <div className="row">
        {isHomebrew && (
          <button type="button" className="btn primary" onClick={actions.onEdit}>
            <Icon name="pencil" />
            Edit
          </button>
        )}
        <button type="button" className="btn" onClick={actions.onDuplicate}>
          Duplicate to homebrew
        </button>
        {isHomebrew && record.basedOn && (
          <button type="button" className="btn" onClick={() => void showDiff()}>
            {diff ? 'Hide changes' : 'Changes from original'}
          </button>
        )}
        {isHomebrew && (
          <>
            <span className="spacer" />
            {confirm ? (
              <InlineConfirm
                name={record.displayName}
                onConfirm={() => actions.onRemove(record.id)}
                onKeep={() => setConfirm(false)}
              />
            ) : (
              <button
                type="button"
                className="chrome-btn danger"
                aria-label={`Delete ${record.displayName}`}
                title="Delete this homebrew record"
                onClick={() => setConfirm(true)}
              >
                <Icon name="trash" />
              </button>
            )}
          </>
        )}
      </div>
      {diff && (
        <div className="diff" data-testid="record-diff">
          {diff.length === 0 ? (
            <p className="muted small">No changes from the original.</p>
          ) : (
            <dl className="sb-details">
              {diff.map((l) => (
                <div key={l.field} className="dl-row">
                  <dt>{l.field}</dt>
                  <dd>
                    <span className="diff-from">{l.from}</span> →{' '}
                    <span className="diff-to">{l.to}</span>
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
    </div>
  );
}

const SCHOOLS: Record<string, string> = {
  A: 'Abjuration',
  C: 'Conjuration',
  D: 'Divination',
  EN: 'Enchantment',
  EV: 'Evocation',
  I: 'Illusion',
  N: 'Necromancy',
  T: 'Transmutation',
};

const BULLET = /^\s*[*-]\s+/;

/**
 * Record text as paragraphs. A paragraph whose lines are bullets (`* ` or `- `, as the SRD
 * conditions and some spell text are written) becomes a list, with any first unbulleted line
 * as its lead; everything else is shown as written.
 */
function Text({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n{2,}/).map((p, i) => {
        const lines = p.split('\n');
        const bullets = lines.filter((l) => BULLET.test(l));
        if (bullets.length === 0 || bullets.length < lines.length - 1) return <p key={i}>{p}</p>;
        const lead = lines.find((l) => !BULLET.test(l));
        return (
          <Fragment key={i}>
            {lead && <p>{lead}</p>}
            <ul>
              {bullets.map((l, j) => (
                <li key={j}>{l.replace(BULLET, '')}</li>
              ))}
            </ul>
          </Fragment>
        );
      })}
    </>
  );
}

/** The `<roll>` entries of a spell, item, feat or trait as pills that roll into the shared log. */
function RollPills({ actor, rolls }: { actor: string; rolls: Roll[] }) {
  if (rolls.length === 0) return null;
  return (
    <p className="roll-pills">
      {rolls.map((r, i) => {
        const label = `${r.description ?? 'Roll'}${r.level ? ` (level ${r.level})` : ''}`;
        return (
          <button
            key={i}
            type="button"
            className="badge roll clickable"
            title={`Roll ${r.dice}`}
            onClick={() => void logDiceRoll(actor, label, r.dice)}
          >
            {label}: {r.dice}
          </button>
        );
      })}
    </p>
  );
}

/** The newest roll made from this record, so a click shows its result without opening Dice. */
function LastRoll({ actor }: { actor: string }) {
  const last = useRollLogStore(
    (s) => s.entries.find((e) => e.source === 'compendium' && e.actor === actor) ?? null,
  );
  const reveal = useRollReveal(last);
  if (!last) return null;
  return (
    <output className="detail-last-roll" aria-live="polite" data-testid="detail-last-roll">
      <RollReveal entry={last} reveal={reveal} className="last-roll-total" />
      <span className={`muted small reveal-detail${reveal.settled ? ' settled' : ''}`}>
        {last.label}
        {reveal.settled && last.faces ? ` · ${last.faces}` : ''}
      </span>
    </output>
  );
}

function Rows({ rows }: { rows: Array<[string, string | undefined | null]> }) {
  return (
    <dl className="sb-details">
      {rows
        .filter((r): r is [string, string] => Boolean(r[1]))
        .map(([k, v]) => (
          <div key={k} className="dl-row">
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
    </dl>
  );
}

function Body({
  record,
  onOpenSpell,
}: {
  record: CompendiumRecord;
  onOpenSpell(key: string): void;
}) {
  const actions = useMemo(
    () => (record.kind === 'monster' ? compendiumActions(record) : undefined),
    [record],
  );
  switch (record.kind) {
    case 'monster':
      return <StatBlock record={record} onOpenSpell={onOpenSpell} actions={actions} />;
    case 'spell': {
      const d = record.data;
      return (
        <article className="statblock">
          <h2>{record.displayName}</h2>
          <p className="muted">
            {d.level === 0 ? 'Cantrip' : `Level ${d.level}`}
            {d.school ? ` ${SCHOOLS[d.school] ?? d.school}` : ''}
            {d.ritual ? ' (ritual)' : ''}
          </p>
          <Rows
            rows={[
              ['Casting time', d.time],
              ['Range', d.range],
              ['Components', d.components],
              ['Duration', d.duration],
              ['Classes', d.classes.join(', ')],
            ]}
          />
          <RollPills actor={record.displayName} rolls={d.rolls} />
          <Text text={d.text} />
        </article>
      );
    }
    case 'item': {
      const d = record.data;
      return (
        <article className="statblock">
          <h2>{record.displayName}</h2>
          <p className="muted">
            {itemTypeName(d.typeCode)}
            {d.rarity ? ` · ${d.rarity}` : ''}
            {d.requiresAttunement ? ' · requires attunement' : ''}
            {d.magic ? ' · magic' : ''}
          </p>
          <Rows
            rows={[
              [
                'Damage',
                d.dmg1
                  ? `${d.dmg1}${d.dmg2 ? ` / ${d.dmg2}` : ''}${d.dmgType ? ` ${d.dmgType}` : ''}`
                  : undefined,
              ],
              ['Properties', d.properties.join(', ')],
              ['Range', d.range],
              ['AC', d.ac !== undefined ? String(d.ac) : undefined],
              ['Strength', d.strength !== undefined ? String(d.strength) : undefined],
              ['Stealth', d.stealthDisadvantage ? 'disadvantage' : undefined],
              ['Weight', d.weight !== undefined ? `${d.weight} lb.` : undefined],
              ['Value', d.value !== undefined ? `${d.value} gp` : undefined],
            ]}
          />
          <RollPills actor={record.displayName} rolls={d.rolls} />
          <Text text={d.text} />
          {d.contents.length > 0 && (
            <p>Contents: {d.contents.map((c) => `${c.quantity} × ${c.name}`).join(', ')}</p>
          )}
          {d.modifiers.length > 0 && (
            <p className="muted">Modifiers: {d.modifiers.map((m) => m.raw).join(', ')}</p>
          )}
        </article>
      );
    }
    case 'feat': {
      const d = record.data;
      return (
        <article className="statblock">
          <h2>{record.displayName}</h2>
          <Rows rows={[['Prerequisite', d.prerequisite]]} />
          <RollPills actor={record.displayName} rolls={d.rolls} />
          <Text text={d.text} />
        </article>
      );
    }
    case 'condition':
      return (
        <article className="statblock">
          <h2>{record.displayName}</h2>
          <Text text={record.data.text} />
        </article>
      );
    case 'species':
    case 'background': {
      const d = record.data;
      return (
        <article className="statblock">
          <h2>{record.displayName}</h2>
          {record.kind === 'species' && (
            <Rows
              rows={[
                ['Size', record.data.size],
                ['Speed', record.data.speed],
                ['Ability', record.data.ability],
                ['Languages', record.data.languages],
              ]}
            />
          )}
          {record.kind === 'background' && (
            <Rows rows={[['Proficiencies', record.data.proficiency]]} />
          )}
          {d.traits.map((t, i) => (
            <div key={i} className="sb-feature">
              <strong>{t.name}</strong>
              <RollPills actor={record.displayName} rolls={t.rolls} />
              <Text text={t.text} />
            </div>
          ))}
        </article>
      );
    }
    case 'class': {
      const d = record.data;
      return (
        <article className="statblock">
          <h2>{record.displayName}</h2>
          <Rows
            rows={[
              ['Hit die', d.hd ? `d${d.hd}` : undefined],
              ['Proficiencies', d.proficiency],
              ['Spellcasting', d.spellAbility],
            ]}
          />
          {d.levels.map((l) => (
            <section key={l.level} className="sb-section">
              <h3>
                Level {l.level}
                {l.scoreImprovement ? ' · ability score improvement' : ''}
              </h3>
              {l.slots && <p className="muted">Slots: {l.slots.values.join(', ')}</p>}
              {l.features.map((f, i) => (
                <div key={i} className="sb-feature">
                  <strong>{f.name}</strong>
                  {f.optional && <span className="badge">optional</span>}
                  <Text text={f.text} />
                </div>
              ))}
            </section>
          ))}
        </article>
      );
    }
  }
}

function sourceText(record: CompendiumRecord): string {
  switch (record.kind) {
    case 'monster':
      return [
        record.data.description ?? '',
        ...[
          ...record.data.traits,
          ...record.data.actions,
          ...record.data.bonusActions,
          ...record.data.reactions,
          ...record.data.legendary.actions,
          ...record.data.lair,
        ].map((f) => `${f.name}\n${f.text}`),
      ]
        .filter(Boolean)
        .join('\n\n');
    case 'spell':
    case 'item':
    case 'feat':
    case 'condition':
      return record.data.text;
    case 'species':
    case 'background':
      return record.data.traits.map((t) => `${t.name}\n${t.text}`).join('\n\n');
    case 'class':
      return record.data.levels
        .flatMap((l) => l.features.map((f) => `Level ${l.level}: ${f.name}\n${f.text}`))
        .join('\n\n');
  }
}

export function RecordDetail({
  record,
  editions,
  canGoBack,
  backTo,
  onBack,
  onBackToResults,
  onSwitchEdition,
  onOpenSpell,
  sourceNames = {},
  homebrew,
}: Props) {
  const [tab, setTab] = useState<'block' | 'source'>('block');
  const extra = Object.keys(record.data.extra);

  return (
    <div className="detail">
      <div className="row detail-bar">
        {onBackToResults && (
          <button
            type="button"
            className="chrome-btn results-back"
            aria-label="Back to results"
            title="Back to results"
            onClick={onBackToResults}
          >
            <Icon name="left" />
          </button>
        )}
        {canGoBack && (
          <button
            type="button"
            className="chrome-btn"
            aria-label={backTo ? `Back to ${backTo}` : 'Back'}
            title={backTo ? `Back to ${backTo}` : 'Back'}
            onClick={onBack}
          >
            <Icon name="left" />
          </button>
        )}
        {editions.length > 1 && (
          <span className="seg" role="group" aria-label="Switch edition">
            {editions.map((e) => (
              <button
                key={e.id}
                type="button"
                className="btn"
                aria-pressed={e.id === record.id}
                onClick={() => onSwitchEdition(e)}
              >
                {e.edition === '2014' ? 'Legacy' : e.edition}
                {editions.filter((o) => o.edition === e.edition).length > 1
                  ? ` · ${sourceNames[e.sourceId] ?? e.sourceBook ?? e.sourceId}`
                  : ''}
              </button>
            ))}
          </span>
        )}
        <span className="badge">{record.edition === '2014' ? 'legacy' : record.edition}</span>
        {record.sourceBook && (
          <span className="muted">
            {record.sourceBook}
            {record.sourcePage !== undefined ? ` p. ${record.sourcePage}` : ''}
          </span>
        )}
        <span className="spacer" />
        <span className="seg" role="group" aria-label="View">
          <button
            type="button"
            className="btn"
            aria-pressed={tab === 'block'}
            onClick={() => setTab('block')}
          >
            Stat block
          </button>
          <button
            type="button"
            className="btn"
            aria-pressed={tab === 'source'}
            onClick={() => setTab('source')}
          >
            Source text
          </button>
        </span>
      </div>

      {tab === 'block' ? (
        <>
          {homebrew && <HomebrewBar record={record} actions={homebrew} />}
          <LastRoll actor={record.displayName} />
          <Body record={record} onOpenSpell={onOpenSpell} />
        </>
      ) : (
        <article className="statblock">
          <h2>{record.name}</h2>
          <pre className="source-text">{sourceText(record)}</pre>
          {extra.length > 0 && (
            <p className="muted">Unknown elements preserved from the file: {extra.join(', ')}</p>
          )}
        </article>
      )}
    </div>
  );
}

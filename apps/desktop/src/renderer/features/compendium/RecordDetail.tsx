import { useState } from 'react';
import type { CompendiumRecord } from '@trifold/schema';
import { StatBlock } from './StatBlock';

interface Props {
  record: CompendiumRecord;
  editions: CompendiumRecord[];
  canGoBack: boolean;
  onBack(): void;
  onSwitchEdition(record: CompendiumRecord): void;
  onOpenSpell(key: string): void;
  /** Source names by id, used to tell apart editions that come from different sources. */
  sourceNames?: Record<string, string>;
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

function Text({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n{2,}/).map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </>
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
  switch (record.kind) {
    case 'monster':
      return <StatBlock record={record} onOpenSpell={onOpenSpell} />;
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
          <Text text={d.text} />
          {d.rolls.length > 0 && (
            <p className="muted">
              Rolls:{' '}
              {d.rolls
                .map(
                  (r) =>
                    `${r.description ?? 'roll'}${r.level ? ` (level ${r.level})` : ''} ${r.dice}`,
                )
                .join(' · ')}
            </p>
          )}
        </article>
      );
    }
    case 'item': {
      const d = record.data;
      return (
        <article className="statblock">
          <h2>{record.displayName}</h2>
          <p className="muted">
            {d.typeCode}
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
          <Text text={d.text} />
        </article>
      );
    }
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
  onBack,
  onSwitchEdition,
  onOpenSpell,
  sourceNames = {},
}: Props) {
  const [tab, setTab] = useState<'block' | 'source'>('block');
  const extra = Object.keys(record.data.extra);

  return (
    <div className="detail">
      <div className="row detail-bar">
        {canGoBack && (
          <button type="button" className="btn" onClick={onBack}>
            Back
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
        <Body record={record} onOpenSpell={onOpenSpell} />
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

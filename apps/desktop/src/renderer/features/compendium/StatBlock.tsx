import type { RollMode } from '@trifold/rules';
import type { Attack, Feature, MonsterRecord, RollButton, SaveCall } from '@trifold/schema';
import type React from 'react';
import {
  capitalize,
  crText,
  initiativeBonus,
  linkifySpells,
  SIZE_NAMES,
  signed,
  speedText,
  usesText,
} from './formatting';

/** Roll handlers supplied by the combat tracker; without them badges are inert. */
export interface StatBlockActions {
  onAttack(feature: Feature, attack: Attack, mode: RollMode): void;
  onRoll(feature: Feature, roll: RollButton): void;
  onSave(feature: Feature, save: SaveCall): void;
  onMultiattack(feature: Feature, mode: RollMode): void;
}

/** Shift-click rolls with advantage, Ctrl-click with disadvantage; a plain click rolls normally. */
function modeFromClick(e: React.MouseEvent): RollMode {
  if (e.shiftKey) return 'advantage';
  if (e.ctrlKey || e.metaKey) return 'disadvantage';
  return 'normal';
}

const MODE_HINT = 'Shift-click: advantage · Ctrl-click: disadvantage';

/**
 * A d20 roll badge with its own advantage and disadvantage buttons, so the mode is chosen per
 * roll rather than set once for the fight. The two small buttons show on hover or focus.
 */
function D20Roll({
  name,
  title,
  onRoll,
  children,
}: {
  name: string;
  title?: string;
  onRoll(mode: RollMode): void;
  children: React.ReactNode;
}) {
  return (
    <span className="d20-roll">
      <button
        type="button"
        className="badge roll clickable"
        title={title ? `${title} · ${MODE_HINT}` : MODE_HINT}
        onClick={(e) => onRoll(modeFromClick(e))}
      >
        {children}
      </button>
      <span className="roll-modes">
        <button
          type="button"
          className="badge roll-mode clickable"
          aria-label={`Roll ${name} with advantage`}
          title="Roll with advantage (Shift-click)"
          onClick={() => onRoll('advantage')}
        >
          Adv
        </button>
        <button
          type="button"
          className="badge roll-mode clickable"
          aria-label={`Roll ${name} with disadvantage`}
          title="Roll with disadvantage (Ctrl-click)"
          onClick={() => onRoll('disadvantage')}
        >
          Dis
        </button>
      </span>
    </span>
  );
}

interface Props {
  record: MonsterRecord;
  onOpenSpell(key: string): void;
  actions?: StatBlockActions;
}

function Badge({
  className,
  title,
  onClick,
  children,
}: {
  className: string;
  title?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return onClick ? (
    <button type="button" className={`${className} clickable`} title={title} onClick={onClick}>
      {children}
    </button>
  ) : (
    <span className={className} title={title}>
      {children}
    </span>
  );
}

const ABILITIES = [
  ['str', 'Str'],
  ['dex', 'Dex'],
  ['con', 'Con'],
  ['int', 'Int'],
  ['wis', 'Wis'],
  ['cha', 'Cha'],
] as const;

function Paragraphs({
  text,
  spells,
  onOpenSpell,
}: {
  text: string;
  spells: readonly string[];
  onOpenSpell(key: string): void;
}) {
  return (
    <>
      {text.split(/\n{2,}/).map((para, i) => (
        <p key={i}>
          {linkifySpells(para, spells).map((part, j) =>
            part.key ? (
              <button
                key={j}
                type="button"
                className="link"
                onClick={() => onOpenSpell(part.key ?? '')}
              >
                {part.text}
              </button>
            ) : (
              <span key={j}>{part.text}</span>
            ),
          )}
        </p>
      ))}
    </>
  );
}

function FeatureList({
  title,
  features,
  spells,
  onOpenSpell,
  intro,
  actions,
}: {
  title: string;
  features: Feature[];
  spells: readonly string[];
  onOpenSpell(key: string): void;
  intro?: string;
  actions?: StatBlockActions;
}) {
  if (features.length === 0 && !intro) return null;
  return (
    <section className="sb-section">
      <h3>{title}</h3>
      {intro && <p className="muted">{intro}</p>}
      {features.map((f, i) => (
        <div key={`${f.name}-${i}`} className="sb-feature">
          <div className="sb-feature-head">
            <strong>{f.displayName}</strong>
            {actions && /^multiattack$/i.test(f.displayName) && (
              <D20Roll name="all attacks" onRoll={(mode) => actions.onMultiattack(f, mode)}>
                Roll all
              </D20Roll>
            )}
            {usesText(f) && <span className="sb-uses">({usesText(f)})</span>}
            {f.cost !== undefined && f.cost > 1 && (
              <span className="sb-uses">(Costs {f.cost} Actions)</span>
            )}
            {f.tags.includes('variant') && <span className="badge">variant</span>}
            {f.attacks.map((a, j) => {
              const title = a.reach ? `reach ${a.reach}` : a.range ? `range ${a.range}` : undefined;
              const text = (
                <>
                  {a.toHit !== undefined ? signed(a.toHit) : ''}
                  {a.toHit !== undefined && a.damage ? ' · ' : ''}
                  {a.damage ?? ''}
                  {a.damageType ? ` ${a.damageType}` : ''}
                  {a.extraDamage.map((x) => ` + ${x.damage} ${x.damageType ?? ''}`).join('')}
                </>
              );
              // Damage-only attacks roll no d20, so they have no mode to pick.
              return actions && a.toHit !== undefined ? (
                <D20Roll
                  key={j}
                  name={f.displayName}
                  title={title}
                  onRoll={(mode) => actions.onAttack(f, a, mode)}
                >
                  {text}
                </D20Roll>
              ) : (
                <Badge
                  key={j}
                  className="badge roll"
                  title={title}
                  onClick={actions ? () => actions.onAttack(f, a, 'normal') : undefined}
                >
                  {text}
                </Badge>
              );
            })}
            {f.rolls.map((r, j) => (
              <Badge
                key={`r${j}`}
                className="badge roll"
                onClick={actions ? () => actions.onRoll(f, r) : undefined}
              >
                {r.label}: {r.dice}
              </Badge>
            ))}
            {f.saves.map((s, j) => (
              <Badge
                key={`s${j}`}
                className="badge save"
                onClick={actions ? () => actions.onSave(f, s) : undefined}
              >
                DC {s.dc} {s.ability.toUpperCase()}
                {s.halfOnSuccess ? ' · half' : ''}
              </Badge>
            ))}
          </div>
          <Paragraphs text={f.text} spells={spells} onOpenSpell={onOpenSpell} />
        </div>
      ))}
    </section>
  );
}

/** Monster stat block in the 2024 layout regardless of the record's edition (DESIGN.md §6.1). */
export function StatBlock({ record, onOpenSpell, actions }: Props) {
  const d = record.data;
  const spells = d.spellcasting?.spells ?? [];
  const treasure = d.traits.filter((t) => /^treasure$/i.test(t.displayName));
  const traits = d.traits.filter((t) => !/^treasure$/i.test(t.displayName));
  const skills = Object.entries(d.skills);
  const saves = Object.entries(d.saves);

  return (
    <article className="statblock">
      <header>
        <h2>{record.displayName}</h2>
        <p className="muted">
          {d.size ? SIZE_NAMES[d.size] : 'Unknown size'} {capitalize(d.type)}
          {d.subtype ? ` (${d.subtype})` : ''}
          {d.alignment ? `, ${d.alignment}` : ''}
        </p>
      </header>

      <dl className="sb-core">
        <dt>AC</dt>
        <dd>
          {d.ac ? d.ac.value : '—'}
          {d.ac?.note ? ` (${d.ac.note})` : ''}
        </dd>
        <dt>Initiative</dt>
        <dd>{signed(initiativeBonus(d))}</dd>
        <dt>HP</dt>
        <dd>
          {d.hp ? d.hp.average : '—'}
          {d.hp?.formula ? ` (${d.hp.formula})` : ''}
        </dd>
        <dt>Speed</dt>
        <dd>{speedText(d)}</dd>
      </dl>

      <table className="sb-abilities">
        <thead>
          <tr>
            <th></th>
            <th>Score</th>
            <th>Mod</th>
            <th>Save</th>
          </tr>
        </thead>
        <tbody>
          {ABILITIES.map(([key, label]) => {
            const score = d.abilities[key];
            const mod = Math.floor((score - 10) / 2);
            const save = d.saves[key] ?? mod;
            return (
              <tr key={key}>
                <th>{label}</th>
                <td>{score}</td>
                <td>{signed(mod)}</td>
                <td>{signed(save)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <dl className="sb-details">
        {skills.length > 0 && (
          <>
            <dt>Skills</dt>
            <dd>{skills.map(([k, v]) => `${k} ${signed(v)}`).join(', ')}</dd>
          </>
        )}
        {saves.length > 0 && record.edition !== '2024' && (
          <>
            <dt>Saving throws</dt>
            <dd>{saves.map(([k, v]) => `${capitalize(k)} ${signed(v)}`).join(', ')}</dd>
          </>
        )}
        {d.damageVulnerabilities.length > 0 && (
          <>
            <dt>Vulnerabilities</dt>
            <dd>{d.damageVulnerabilities.join('; ')}</dd>
          </>
        )}
        {d.damageResistances.length > 0 && (
          <>
            <dt>Resistances</dt>
            <dd>{d.damageResistances.join('; ')}</dd>
          </>
        )}
        {d.damageImmunities.length > 0 && (
          <>
            <dt>Immunities</dt>
            <dd>
              {d.damageImmunities.join('; ')}
              {d.conditionImmunities.length > 0 ? `; ${d.conditionImmunities.join(', ')}` : ''}
            </dd>
          </>
        )}
        {d.damageImmunities.length === 0 && d.conditionImmunities.length > 0 && (
          <>
            <dt>Immunities</dt>
            <dd>{d.conditionImmunities.join(', ')}</dd>
          </>
        )}
        <dt>Senses</dt>
        <dd>
          {d.senses || '—'}
          {d.passivePerception !== undefined && !/passive/i.test(d.senses)
            ? `${d.senses ? '; ' : ''}Passive Perception ${d.passivePerception}`
            : ''}
        </dd>
        <dt>Languages</dt>
        <dd>{d.languages || '—'}</dd>
        <dt>CR</dt>
        <dd>{crText(d)}</dd>
      </dl>

      <FeatureList
        title="Traits"
        features={traits}
        spells={spells}
        onOpenSpell={onOpenSpell}
        actions={actions}
      />
      <FeatureList
        title="Actions"
        features={d.actions}
        spells={spells}
        onOpenSpell={onOpenSpell}
        actions={actions}
      />
      <FeatureList
        title="Bonus actions"
        features={d.bonusActions}
        spells={spells}
        onOpenSpell={onOpenSpell}
      />
      <FeatureList
        title="Reactions"
        features={d.reactions}
        spells={spells}
        onOpenSpell={onOpenSpell}
      />
      <FeatureList
        title="Legendary actions"
        features={d.legendary.actions}
        spells={spells}
        onOpenSpell={onOpenSpell}
        actions={actions}
        intro={
          d.legendary.header ??
          (d.legendary.perTurn ? `Legendary Action Uses: ${d.legendary.perTurn}.` : undefined)
        }
      />
      <FeatureList
        title="Lair"
        features={d.lair}
        spells={spells}
        onOpenSpell={onOpenSpell}
        actions={actions}
      />

      {spells.length > 0 && (
        <section className="sb-section">
          <h3>Spells</h3>
          <p>
            {spells.map((name, i) => (
              <span key={name}>
                {i > 0 ? ', ' : ''}
                <button
                  type="button"
                  className="link"
                  onClick={() => onOpenSpell(linkifySpells(name, [name])[0]?.key ?? '')}
                >
                  {name}
                </button>
              </span>
            ))}
          </p>
          {d.spellcasting?.slots && (
            <p className="muted">
              Slots:{' '}
              {d.spellcasting.slots
                .slice(1)
                .map((n, i) => `${i + 1}: ${n}`)
                .join(' · ')}
            </p>
          )}
        </section>
      )}

      {(treasure.length > 0 || d.environment.length > 0 || d.isNpc) && (
        <section className="sb-section">
          <h3>DM info</h3>
          {treasure.map((t) => (
            <p key={t.name}>
              <strong>Treasure.</strong> {t.text}
            </p>
          ))}
          {d.environment.length > 0 && (
            <p>
              <strong>Environment.</strong> {d.environment.join(', ')}
            </p>
          )}
          {d.isNpc && <p className="badge">named NPC</p>}
        </section>
      )}

      {d.description && (
        <section className="sb-section">
          <h3>Description</h3>
          <Paragraphs text={d.description} spells={spells} onOpenSpell={onOpenSpell} />
        </section>
      )}
    </article>
  );
}

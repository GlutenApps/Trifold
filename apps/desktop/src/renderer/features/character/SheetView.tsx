import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  ABILITY_NAMES,
  armourWorn,
  normalizeKey,
  attackBonus,
  attunedCount,
  classLine,
  deriveSheet,
  setSlotsUsed,
  SKILL_ABILITY,
  SKILL_NAMES,
  slotsAt,
  spendSlot,
  tableNumbers,
  type RollMode,
} from '@trifold/rules';
import { ulid } from 'ulid';
import type { Ability, Character, Sheet, SheetItem, Skill } from '@trifold/schema';
import { useRollLogStore } from '../../stores/rollLogStore';
import { useShellStore } from '../../stores/shellStore';
import { Icon } from '../shell/icons';
import { SubTabs, type SubTab } from '../shell/SubTabs';
import { SheetRow } from './LinkedRow';
import { Pips, ResourcesSection, type SheetEvent } from './Resources';
import { signed } from './fields';
import { d20, damageDice, rollFromSheet, type SheetRollOptions } from './sheetRolls';
import { toggleItem, useAttunementNeeded } from './itemFacts';
import { AddPanel, ItemEditor, type Added } from './SheetEdit';

/**
 * A character's sheet to read and use at the table (docs/PLAYER-MODE.md, "My characters and
 * Sheets"; ADR 0069; its layout, ADR 0080). The header; a turn bar that stays at the top while
 * the sheet scrolls, with the table's HP and conditions (`live`), the roll mode and the last roll;
 * the four numbers every turn needs; then abilities and skills, pinned on the left once the sheet
 * is 640 px wide, beside sub-tabs for actions, spells, features, equipment and notes.
 *
 * What can be pressed looks pressable, and nothing else does (ADR 0080): a rollable number is a
 * boxed button, the one rollable tile has a border and a die, a pip is a dot in a round target
 * that lights on hover, and a row lights only when it opens or has an action. Numbers to read sit
 * on flat or recessed ground with no border. Without `rolls` or `resources` (the GM's card, a
 * preview) the same numbers and pips are drawn inert.
 */

const ABILITIES: Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const SKILLS = Object.keys(SKILL_NAMES) as Skill[];
const SHORT: Record<Ability, string> = {
  str: 'Str',
  dex: 'Dex',
  con: 'Con',
  int: 'Int',
  wis: 'Wis',
  cha: 'Cha',
};

/** The sheet's sub-tabs. Abilities is one only while the sheet is too narrow to pin them. */
type Group = 'actions' | 'spells' | 'abilities' | 'features' | 'equipment' | 'notes';
/** From this width abilities and skills are pinned on the left (UI guidelines §10). */
const PIN_FROM = 640;

/** Rolling from the sheet (ADR 0075): who rolls, and at the table, whose initiative it is. */
export type SheetRolls = Pick<SheetRollOptions, 'actor' | 'initiative' | 'onInitiative'>;

type Roll = ((label: string, expression: string) => void) | null;

/** A number that rolls: a boxed button when there is somewhere to roll it, plain text otherwise. */
function RollNum({
  label,
  expression,
  onRoll,
  dice,
  children,
}: {
  label: string;
  expression: string | null;
  onRoll: Roll;
  /** Damage dice rather than a bonus: set a little lighter. */
  dice?: boolean;
  children: ReactNode;
}) {
  const cls = dice ? ' dice' : '';
  if (!onRoll || !expression) return <span className={`sh-ro${cls}`}>{children}</span>;
  return (
    <button
      type="button"
      className={`sh-roll${cls}`}
      aria-label={`Roll ${label}`}
      title={`Roll ${label}: ${expression}`}
      onClick={() => onRoll(label, expression)}
    >
      {children}
    </button>
  );
}

/** "Set by hand": a number the player typed over what the sheet works out. */
function HandMark() {
  return (
    <span className="sh-hand" title="Set by hand">
      <Icon name="pencil" size={12} />
      <span className="sr-only">set by hand</span>
    </span>
  );
}

/** Proficiency in a save or skill: a small diamond, never a round dot, so it is not a pip. */
function ProfMark({ trained }: { trained?: 'proficient' | 'expertise' | undefined }) {
  if (!trained) return <span className="sh-prof" aria-hidden="true" />;
  return (
    <span
      className={`sh-prof ${trained}`}
      title={trained === 'expertise' ? 'Expertise' : 'Proficient'}
    >
      <span className="sr-only">{trained}</span>
    </span>
  );
}

/** One of the four numbers every turn needs: recessed and borderless, because it only reads. */
function Vital({
  label,
  value,
  extra,
  title,
}: {
  label: string;
  value: ReactNode;
  extra?: ReactNode;
  title?: string;
}) {
  return (
    <div className="sh-vital" title={title}>
      <span className="sh-v-label">
        {label}
        {extra}
      </span>
      <span className="sh-v-val">{value}</span>
    </div>
  );
}

/** A section with its heading; in a tab that holds only it, the heading is for screen readers. */
function Section({
  title,
  solo,
  meta,
  className,
  children,
}: {
  title: string;
  solo?: boolean;
  meta?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`sh-sec${className ? ` ${className}` : ''}`} aria-label={title}>
      {solo && !meta ? (
        <h3 className="sr-only">{title}</h3>
      ) : (
        <div className={`sh-sec-head${solo ? ' solo' : ''}`}>
          <h3 className={solo ? 'sr-only' : undefined}>{title}</h3>
          {meta && <div className="sh-meta">{meta}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** Opens a character's sheet link as a web tab (ADR 0011). */
function SheetLink({ character }: { character: Character }) {
  const addWebTab = useShellStore((s) => s.addWebTab);
  if (!character.sheetUrl) return null;
  const url = character.sheetUrl;
  return (
    <button
      type="button"
      className="btn"
      onClick={() => addWebTab({ url, title: `${character.name}’s sheet` })}
    >
      <Icon name="external" />
      Open character sheet
    </button>
  );
}

/** The armour behind AC, as the AC tile's tooltip: what is worn, from items or the setting. */
function armourText(sheet: Sheet | undefined): string | undefined {
  if (!sheet) return undefined;
  const { body, shield } = armourWorn(sheet);
  const kind = body ? `${body.armor.kind[0]!.toUpperCase()}${body.armor.kind.slice(1)}` : '';
  const bodyText = body
    ? body.item
      ? `${body.item} (${body.armor.kind}, base ${body.armor.base})`
      : `${kind} armour, base ${body.armor.base}`
    : 'No armour';
  const shieldText = shield ? `, ${shield.item ?? 'shield'} (+${shield.armor.base})` : '';
  const bonus = sheet.armor.bonus ? `, ${signed(sheet.armor.bonus)}` : '';
  return `${bodyText}${shieldText}${bonus}`;
}

/** Coins as the Equipment tab shows them, largest first: "5 PP · 47 GP · 12 SP". */
function coinsText(sheet: Sheet): string {
  const c = sheet.coins;
  return (
    [
      ['PP', c?.pp ?? 0],
      ['GP', sheet.gp],
      ['EP', c?.ep ?? 0],
      ['SP', c?.sp ?? 0],
      ['CP', c?.cp ?? 0],
    ] as const
  )
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n.toLocaleString()} ${k}`)
    .join(' · ');
}

/** "fly 30 ft, swim 30 ft": a list of named distances, the ones set. */
function feet(list: Partial<Record<string, number>> | undefined): string {
  return Object.entries(list ?? {})
    .filter((e): e is [string, number] => typeof e[1] === 'number' && e[1] > 0)
    .map(([k, n]) => `${k} ${n} ft`)
    .join(', ');
}

/** Defences, senses and other speeds the sheet has (docs/CHARACTER-SHEET.md, items 20 and 21). */
function defenceLines(sheet: Sheet): { label: string; value: string }[] {
  const d = sheet.defenses;
  return [
    { label: 'Resistant', value: d?.resist.join(', ') ?? '' },
    { label: 'Immune', value: d?.immune.join(', ') ?? '' },
    { label: 'Vulnerable', value: d?.vulnerable.join(', ') ?? '' },
    { label: 'Condition immunities', value: d?.conditionImmune.join(', ') ?? '' },
    { label: 'Senses', value: feet(sheet.senses) },
    { label: 'Other speeds', value: feet(sheet.speeds) },
  ].filter((l) => l.value);
}

/** "Armor: light, heavy. Languages: Common." as label and value pairs, one per sentence. */
function proficiencyLines(text: string): { label: string | null; value: string }[] {
  return text
    .split(/\.\s+|\.$|\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const at = p.indexOf(':');
      return at > 0
        ? { label: p.slice(0, at).trim(), value: p.slice(at + 1).trim() }
        : { label: null, value: p };
    });
}

/** The nearest ancestor that scrolls: the panel the sheet sits in. */
function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement ?? null; p; p = p.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(p).overflowY)) return p;
  }
  return null;
}

/**
 * The last thing rolled or done, in one line that never changes shape: the total in a fixed cell,
 * the roll's name, then the dice. A rest, a hit die or a cast says itself here too, with Undo.
 */
function Readout({
  actor,
  event,
  onUndo,
}: {
  actor: string;
  event: (SheetEvent & { at: number }) | null;
  onUndo: (() => void) | null;
}) {
  const last = useRollLogStore((s) => s.entries.find((e) => e.actor === actor) ?? null);
  const showEvent = !!event && (!last || event.at >= last.at);
  if (showEvent) {
    const full = `${event.label}: ${event.detail}`;
    return (
      <div className="tb-roll" role="status" title={full} data-testid="sheet-last-roll">
        <span className="lr-total">{event.total ?? <Icon name="dice" size={14} />}</span>
        <span className="lr-label">{event.label}</span>
        <span className="lr-detail">{event.detail}</span>
        {event.undo && onUndo && (
          <button type="button" className="btn small lr-undo" onClick={onUndo}>
            Undo
          </button>
        )}
      </div>
    );
  }
  if (!last) {
    return (
      <div className="tb-roll empty" role="status" data-testid="sheet-last-roll">
        <span className="lr-total">
          <Icon name="dice" size={14} />
        </span>
        <span className="lr-label">No rolls yet</span>
      </div>
    );
  }
  // "Stealth check: 1d20+3 (advantage)" reads as the name, then the dice.
  const cut = last.label.indexOf(': ');
  const name = cut > 0 ? last.label.slice(0, cut) : last.label;
  const expr = cut > 0 ? last.label.slice(cut + 2) : last.expression;
  const detail = [expr, last.faces].filter(Boolean).join(' · ');
  const nat = last.outcome === 'crit' ? ' crit' : last.outcome === 'fumble' ? ' fumble' : '';
  return (
    <div
      key={last.id}
      className={`tb-roll fresh${nat}`}
      role="status"
      title={`${name} ${last.total}: ${detail}`}
      data-testid="sheet-last-roll"
    >
      <span className="lr-total">{last.total}</span>
      <span className="lr-label">{name}</span>
      <span className="lr-detail">
        {detail}
        {last.outcome === 'crit'
          ? ' · natural 20'
          : last.outcome === 'fumble'
            ? ' · natural 1'
            : ''}
      </span>
    </div>
  );
}

export function SheetView({
  character,
  onEdit,
  live,
  tableHp,
  resources,
  rolls,
}: {
  character: Character;
  /** Absent for a preview (Import from PDF), which has nothing to edit yet. */
  onEdit?(): void;
  /** Resources to track at the table (ADR 0074): saves the sheet, and sends a hit die's healing. */
  resources?: { onChange(sheet: Sheet): void; onHeal?(amount: number): void };
  /** Rolling from the sheet (ADR 0075); absent, its numbers are text. */
  rolls?: SheetRolls;
  /** The table's HP and conditions, shown in the turn bar while connected. */
  live?: ReactNode;
  /** The table's HP, to say when its maximum differs from the sheet's. */
  tableHp?: { max: number } | undefined;
}) {
  const t = tableNumbers(character);
  const sheet = character.kind === 'trifold' ? character.sheet : undefined;
  const n = sheet ? deriveSheet(sheet) : null;
  const [mode, setMode] = useState<RollMode>('normal');
  const [problem, setProblem] = useState<string | null>(null);
  const [event, setEvent] = useState<(SheetEvent & { at: number }) | null>(null);
  const [group, setGroup] = useState<Group>('actions');
  const [prepOnly, setPrepOnly] = useState(false);
  const [width, setWidth] = useState(0);
  const [barHeight, setBarHeight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const switched = useRef(false);
  const hasBar = !!live || !!rolls || !!(resources && sheet);

  // The sheet's own width decides whether abilities are pinned or a tab, as the CSS does.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // The tabs stick right under the turn bar, so they need its height.
  useEffect(() => {
    const el = barRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setBarHeight(el.offsetHeight));
    ro.observe(el);
    setBarHeight(el.offsetHeight);
    return () => ro.disconnect();
  }, [hasBar]);

  const roll = rolls
    ? (label: string, expression: string, initiative = false) => {
        setProblem(
          rollFromSheet(label, expression, {
            actor: rolls.actor,
            mode,
            ...(initiative && rolls.initiative ? { initiative: rolls.initiative } : {}),
            ...(initiative && rolls.onInitiative ? { onInitiative: rolls.onInitiative } : {}),
          }),
        );
        // Advantage or disadvantage is for one roll, then back to normal.
        setMode('normal');
      }
    : null;
  const save = sheet && resources ? resources.onChange : null;
  const say = (e: SheetEvent) => setEvent({ ...e, at: Date.now() });
  // An equip or attune reads the item's record first (toggleItem), then saves the latest sheet.
  const latest = useRef(sheet);
  latest.current = sheet;
  const needAttune = useAttunementNeeded(sheet?.equipment ?? []);
  const toggle = (id: string, field: 'equipped' | 'attuned') =>
    save && void toggleItem(() => latest.current, save, id, field);
  /** The add search open in a tab, and the item being changed in place. */
  const [adding, setAdding] = useState<'spell' | 'item' | null>(null);
  // The item being changed keeps the place it had when its editor opened, so typing a new
  // place does not move the row (and its editor) away mid-word; it moves on Done.
  const [editing, setEditing] = useState<{ id: string; place: string } | null>(null);
  const editingItem = editing?.id ?? null;
  const setEditingItem = (id: string | null) => {
    const item = id ? latest.current?.equipment.find((i) => i.id === id) : undefined;
    setEditing(item ? { id: item.id, place: item.place?.trim() ?? '' } : null);
  };
  const placeOf = (i: SheetItem) =>
    editing?.id === i.id ? editing.place : (i.place?.trim() ?? '');
  const addSpell = (added: Added) => {
    const now = latest.current;
    if (!now || !save) return;
    const spell =
      'row' in added
        ? {
            id: ulid(),
            name: added.row.displayName,
            level: Math.min(9, Math.max(0, added.row.level ?? 0)),
            prepared: true,
            ref: { kind: 'spell' as const, key: added.row.key, name: added.row.displayName },
          }
        : { id: ulid(), name: added.name, level: added.level, prepared: true };
    save({ ...now, spells: [...now.spells, spell] });
    say({ label: spell.name, detail: 'added to your spells', undo: now });
  };
  const addItem = (added: Added) => {
    const now = latest.current;
    if (!now || !save) return;
    const item: SheetItem =
      'row' in added
        ? {
            id: ulid(),
            name: added.row.displayName,
            quantity: 1,
            ref: { kind: 'item', key: added.row.key, name: added.row.displayName },
          }
        : { id: ulid(), name: added.name, quantity: 1 };
    save({ ...now, equipment: [...now.equipment, item] });
    say({ label: item.name, detail: 'added to your equipment', undo: now });
  };
  /** Changes an item; a new name drops a link to a record with another name, and what it knew. */
  const patchItem = (id: string, patch: Partial<SheetItem>) => {
    const now = latest.current;
    if (!now || !save) return;
    save({
      ...now,
      equipment: now.equipment.map((i) => {
        if (i.id !== id) return i;
        const next = { ...i, ...patch };
        if (
          patch.name !== undefined &&
          i.ref &&
          normalizeKey(patch.name) !== normalizeKey(i.ref.name)
        ) {
          delete next.ref;
          delete next.armor;
          delete next.attunement;
        }
        return next;
      }),
    });
  };
  const removeFrom = (list: 'spells' | 'equipment', id: string, name: string) => {
    const now = latest.current;
    if (!now || !save) return;
    if (list === 'spells') save({ ...now, spells: now.spells.filter((x) => x.id !== id) });
    else save({ ...now, equipment: now.equipment.filter((x) => x.id !== id) });
    if (editingItem === id) setEditingItem(null);
    say({ label: name, detail: 'removed from the sheet', undo: now });
  };
  const togglePrepared = (id: string) => {
    const now = latest.current;
    if (!now || !save) return;
    save({
      ...now,
      spells: now.spells.map((x) => (x.id === id ? { ...x, prepared: !x.prepared } : x)),
    });
  };
  /** The tab's Add button, in its header (UI guidelines §9). */
  const addButton = (kind: 'spell' | 'item') =>
    save && (
      <button
        type="button"
        className="btn small"
        aria-expanded={adding === kind}
        onClick={() => setAdding(adding === kind ? null : kind)}
      >
        <Icon name="plus" />
        {kind === 'spell' ? 'Add a spell' : 'Add an item'}
      </button>
    );

  const pinned = width >= PIN_FROM;
  const groups: SubTab<Group>[] = [{ id: 'actions', label: 'Actions' }];
  const editable = !!sheet && !!resources;
  if (
    sheet &&
    (sheet.spells.length > 0 ||
      sheet.slots.some((x) => x > 0) ||
      (editable && sheet.spellcastingAbility))
  ) {
    groups.push({ id: 'spells', label: 'Spells' });
  }
  if (!pinned) groups.push({ id: 'abilities', label: 'Abilities' });
  if (sheet && sheet.features.length > 0) groups.push({ id: 'features', label: 'Features' });
  if (sheet && (editable || sheet.equipment.length > 0 || coinsText(sheet))) {
    groups.push({ id: 'equipment', label: 'Equipment' });
  }
  if (character.notes.trim()) groups.push({ id: 'notes', label: 'Notes' });
  const shown: Group = groups.some((g) => g.id === group) ? group : 'actions';

  const select = (g: Group) => {
    switched.current = true;
    setGroup(g);
  };
  // Switching while the tabs are stuck starts the new tab right under them; otherwise the
  // panel stays where it is.
  useLayoutEffect(() => {
    if (!switched.current) return;
    switched.current = false;
    const anchor = anchorRef.current;
    const scroller = scrollParent(anchor);
    if (!anchor || !scroller) return;
    const top = anchor.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    if (top < barHeight) scroller.scrollTop += top - barHeight;
  }, [shown, barHeight]);

  const sub = [
    sheet ? classLine(sheet) || `Level ${t.level}` : t.classText || `Level ${t.level}`,
    sheet?.species,
    sheet?.background,
  ]
    .filter(Boolean)
    .join(' · ');

  // ---------- abilities and skills ----------
  const abilities = (
    <Section
      title="Abilities and saves"
      className="sh-abilities"
      meta={
        n && (
          <span className="sh-kv">
            <span className="k">Proficiency</span>
            <span className="num">{signed(n.proficiencyBonus.value)}</span>
            {n.proficiencyBonus.overridden && <HandMark />}
          </span>
        )
      }
    >
      <div className="sh-abils">
        {ABILITIES.map((a) => {
          const trained = sheet?.saves.includes(a);
          const bonus = t.saves[a];
          return (
            <div key={a} className="sh-abil">
              <span className="sh-abil-name">{ABILITY_NAMES[a]}</span>
              {sheet && n && (
                <>
                  <span className="sh-abil-mod">{signed(n.modifiers[a])}</span>
                  <span className="sh-abil-score">{sheet.abilities[a]}</span>
                </>
              )}
              <span className={`sh-abil-save${trained ? ' trained' : ''}`}>
                <ProfMark trained={trained ? 'proficient' : undefined} />
                Save
                {bonus === undefined ? (
                  <span className="sh-ro">—</span>
                ) : (
                  <RollNum label={`${ABILITY_NAMES[a]} save`} expression={d20(bonus)} onRoll={roll}>
                    {signed(bonus)}
                  </RollNum>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </Section>
  );

  const passives = (
    <dl className="sh-mini">
      <div>
        <dt>Passive Perception</dt>
        <dd>{t.passives.perception}</dd>
      </div>
      <div>
        <dt>Passive Insight</dt>
        <dd>{t.passives.insight}</dd>
      </div>
      <div>
        <dt>Passive Investigation</dt>
        <dd>{t.passives.investigation}</dd>
      </div>
      {!sheet && t.spellSaveDc !== undefined && (
        <div>
          <dt>Spell save DC</dt>
          <dd>{t.spellSaveDc}</dd>
        </div>
      )}
    </dl>
  );

  const skills = (
    <Section title="Skills" className="sh-skills-sec">
      {sheet && n && (
        <div className="sh-skills">
          {SKILLS.map((s) => {
            const trained = sheet.skills[s];
            return (
              <div key={s} className={`sh-skill${trained ? ' trained' : ''}`}>
                <ProfMark trained={trained} />
                <span className="sh-skill-name">{SKILL_NAMES[s]}</span>
                <span className="sh-skill-ab">{SHORT[SKILL_ABILITY[s]]}</span>
                <RollNum
                  label={`${SKILL_NAMES[s]} check`}
                  expression={d20(n.skills[s].value)}
                  onRoll={roll}
                >
                  {signed(n.skills[s].value)}
                </RollNum>
              </div>
            );
          })}
        </div>
      )}
      {passives}
      {sheet?.otherProficiencies.trim() && (
        <dl className="sh-profs">
          {proficiencyLines(sheet.otherProficiencies).map((p, i) => (
            <div key={i}>
              {p.label && <dt>{p.label}</dt>}
              <dd>{p.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </Section>
  );

  // ---------- actions ----------
  const nothingElse =
    sheet &&
    !sheet.attacks.length &&
    !sheet.spells.length &&
    !sheet.features.length &&
    !sheet.equipment.length;
  const actions = (
    <>
      {sheet && n && sheet.attacks.length > 0 && (
        <Section title="Attacks" className="sh-attacks">
          <div className="sh-atk-cols" aria-hidden="true">
            <span />
            <span>To hit</span>
            <span>Damage</span>
          </div>
          {sheet.attacks.map((a) => {
            const name = a.name || 'Attack';
            const dice = damageDice(a.damage);
            const kind = dice ? a.damage.replace(/\d*d\d+(?:\s*[+-]\s*\d+)?/i, '').trim() : '';
            return (
              <div key={a.id} className="sh-atk">
                <span className="sh-atk-name">
                  <span className="sh-name">{name}</span>
                  {kind && <span className="sh-subtext">{kind}</span>}
                </span>
                <RollNum label={`${name} attack`} expression={d20(attackBonus(a, n))} onRoll={roll}>
                  {signed(attackBonus(a, n))}
                </RollNum>
                {dice ? (
                  <RollNum label={`${name} damage`} expression={dice} onRoll={roll} dice>
                    {dice}
                  </RollNum>
                ) : (
                  <span className="sh-ro dice">{a.damage || '—'}</span>
                )}
              </div>
            );
          })}
        </Section>
      )}
      {sheet && resources && (
        <ResourcesSection
          sheet={sheet}
          edition={character.edition}
          onChange={resources.onChange}
          {...(resources.onHeal ? { onHeal: resources.onHeal } : {})}
          slots={false}
          onSaid={say}
        />
      )}
      {nothingElse && (
        <div className="sh-empty">
          <p>
            {onEdit
              ? 'No attacks, spells, features or equipment yet.'
              : 'Nothing else on this sheet yet.'}
          </p>
          {onEdit && (
            <button type="button" className="btn small" onClick={onEdit}>
              <Icon name="pencil" />
              Add in Edit
            </button>
          )}
        </div>
      )}
      {!sheet && (
        <div className="sh-empty">
          <p>
            {character.sheetUrl
              ? 'The rest of this sheet is at its link.'
              : 'This character keeps only the numbers the table needs.'}
          </p>
        </div>
      )}
    </>
  );

  // ---------- spells ----------
  const spells =
    sheet && n
      ? (() => {
          const levels = [
            ...new Set([
              ...sheet.spells.map((s) => s.level),
              ...sheet.slots.flatMap((x, i) => (x > 0 ? [i + 1] : [])),
            ]),
          ].sort((a, b) => a - b);
          const unprepared = sheet.spells.some((s) => s.level > 0 && !s.prepared);
          return (
            <Section
              title="Spells"
              solo
              className="sh-spells"
              meta={
                <>
                  {n.spellAttack && (
                    <span className="sh-kv">
                      <span className="k">Spell attack</span>
                      <RollNum
                        label="Spell attack"
                        expression={d20(n.spellAttack.value)}
                        onRoll={roll}
                      >
                        {signed(n.spellAttack.value)}
                      </RollNum>
                    </span>
                  )}
                  {n.spellSaveDc && (
                    <span className="sh-kv">
                      <span className="k">Save DC</span>
                      <span className="num">{n.spellSaveDc.value}</span>
                    </span>
                  )}
                  {addButton('spell')}
                  {unprepared && (
                    <button
                      type="button"
                      className="chrome-btn xs"
                      aria-pressed={prepOnly}
                      aria-label="Show prepared spells only"
                      title="Show prepared spells only"
                      onClick={() => setPrepOnly((v) => !v)}
                    >
                      <Icon name="filter" />
                    </button>
                  )}
                </>
              }
            >
              {adding === 'spell' && (
                <AddPanel kind="spell" onAdd={addSpell} onClose={() => setAdding(null)} />
              )}
              {sheet.spells.length === 0 && (
                <p className="muted small">No spells on this sheet yet.</p>
              )}
              <div className="sh-lvls">
                {levels.map((level) => {
                  const all = sheet.spells
                    .filter((s) => s.level === level)
                    .sort(
                      (a, b) =>
                        (level > 0 ? Number(b.prepared) - Number(a.prepared) : 0) ||
                        a.name.localeCompare(b.name),
                    );
                  const list = prepOnly && level > 0 ? all.filter((s) => s.prepared) : all;
                  const hidden = all.length - list.length;
                  const { max, left } = slotsAt(sheet, level);
                  return (
                    <div key={level} className="sh-lvl" data-testid={`spell-level-${level}`}>
                      <div className="sh-lvl-head">
                        <h4>{level === 0 ? 'Cantrips' : `Level ${level}`}</h4>
                        {level === 0 ? (
                          <span className="sh-lvl-count">At will</span>
                        ) : (
                          max > 0 && (
                            <>
                              <span className="sh-lvl-count">
                                {left} of {max} slots
                              </span>
                              <Pips
                                label={`Level ${level} slot`}
                                max={max}
                                used={max - left}
                                onChange={save && ((u) => save(setSlotsUsed(sheet, level, u)))}
                              />
                            </>
                          )
                        )}
                      </div>
                      {list.map((s) => {
                        const name = s.name || 'Spell';
                        const unready = level > 0 && !s.prepared;
                        const why =
                          level === 0
                            ? 'Cantrips use no slot'
                            : unready
                              ? 'Not prepared'
                              : left <= 0
                                ? `No level ${level} slots left`
                                : '';
                        return (
                          <SheetRow
                            key={s.id}
                            name={name}
                            sheetRef={s.ref}
                            muted={unready}
                            after={unready ? <span className="badge">not prepared</span> : null}
                            actions={
                              save && (
                                <>
                                  <button
                                    type="button"
                                    className="chrome-btn xs"
                                    aria-pressed={level === 0 || s.prepared}
                                    disabled={level === 0}
                                    aria-label={`Prepare ${name}`}
                                    title={
                                      level === 0
                                        ? 'Cantrips are always ready'
                                        : s.prepared
                                          ? 'Prepared: press to unprepare'
                                          : 'Prepare'
                                    }
                                    onClick={() => togglePrepared(s.id)}
                                  >
                                    <Icon name="checklist" />
                                  </button>
                                  <button
                                    type="button"
                                    className="chrome-btn xs"
                                    disabled={!!why}
                                    aria-label={`Cast ${name} with a level ${level} slot`}
                                    title={why || `Cast: uses a level ${level} slot`}
                                    onClick={() => {
                                      const next = spendSlot(sheet, level);
                                      if (!next) return;
                                      save(next);
                                      say({
                                        label: name,
                                        detail: `cast with a level ${level} slot, ${left - 1} left`,
                                        undo: sheet,
                                      });
                                    }}
                                  >
                                    <Icon name="cast" />
                                  </button>
                                  <button
                                    type="button"
                                    className="chrome-btn xs"
                                    aria-label={`Remove ${name}`}
                                    title="Remove from the sheet"
                                    onClick={() => removeFrom('spells', s.id, name)}
                                  >
                                    <Icon name="close" />
                                  </button>
                                </>
                              )
                            }
                          />
                        );
                      })}
                      {hidden > 0 && <p className="sh-lvl-hidden">{hidden} more not prepared</p>}
                    </div>
                  );
                })}
              </div>
            </Section>
          );
        })()
      : null;

  // ---------- features, equipment, notes ----------
  const features = sheet && sheet.features.length > 0 && (
    <Section title="Features and traits" solo className="sh-feats">
      <div className="sh-flow">
        {sheet.features.map((f) => (
          <SheetRow
            key={f.id}
            name={f.name || 'Feature'}
            sheetRef={f.ref}
            text={f.text}
            after={
              <>
                {f.from && <span className="sh-src">{f.from}</span>}
                {f.uses && (
                  <Pips
                    label={`${f.name || 'Feature'} use`}
                    max={f.uses.max}
                    used={f.uses.used}
                    onChange={
                      save &&
                      ((used) =>
                        save({
                          ...sheet,
                          features: sheet.features.map((x) =>
                            x.id === f.id && x.uses ? { ...x, uses: { ...x.uses, used } } : x,
                          ),
                        }))
                    }
                  />
                )}
              </>
            }
          />
        ))}
      </div>
    </Section>
  );

  const equipment =
    sheet &&
    (sheet.equipment.length > 0 || coinsText(sheet)) &&
    (() => {
      // Grouped by where each item is kept: on the character first, then each place by name.
      const places = [...new Set(sheet.equipment.map(placeOf))].sort((a, b) =>
        a === '' ? -1 : b === '' ? 1 : a.localeCompare(b),
      );
      const allPlaces = [...new Set([...places.filter(Boolean), 'Backpack', 'Mount', 'Home'])];
      const attuned = attunedCount(sheet);
      const attunable = sheet.equipment.some(
        (i) => i.attunement || i.attuned || needAttune.has(i.id),
      );
      const row = (item: SheetItem) => {
        const name = item.name || 'Item';
        const canAttune = item.attunement || item.attuned || needAttune.has(item.id);
        return (
          <SheetRow
            key={item.id}
            name={name}
            sheetRef={item.ref}
            after={
              <>
                {item.quantity !== 1 && <span className="sh-qty">×{item.quantity}</span>}
                {item.uses && (
                  <Pips
                    label={`${name} charge`}
                    max={item.uses.max}
                    used={item.uses.used}
                    onChange={
                      save &&
                      ((used) =>
                        save({
                          ...sheet,
                          equipment: sheet.equipment.map((x) =>
                            x.id === item.id && x.uses ? { ...x, uses: { ...x.uses, used } } : x,
                          ),
                        }))
                    }
                  />
                )}
                {/* Where nothing can be changed, say it in words. */}
                {!save && item.equipped && <span className="sh-tag">equipped</span>}
                {!save && item.attuned && <span className="sh-tag">attuned</span>}
              </>
            }
            actions={
              save && (
                <>
                  <button
                    type="button"
                    className="chrome-btn xs"
                    aria-pressed={!!item.equipped}
                    aria-label={`Equip ${name}`}
                    title={item.equipped ? 'Equipped: press to take it off' : 'Equip'}
                    onClick={() => toggle(item.id, 'equipped')}
                  >
                    <Icon name="hand" />
                  </button>
                  <button
                    type="button"
                    className="chrome-btn xs"
                    aria-pressed={!!item.attuned}
                    disabled={!canAttune}
                    aria-label={`Attune to ${name}`}
                    title={
                      !canAttune
                        ? 'It does not need attunement'
                        : item.attuned
                          ? 'Attuned: press to end it'
                          : 'Attune'
                    }
                    onClick={() => toggle(item.id, 'attuned')}
                  >
                    <Icon name="gem" />
                  </button>
                  <button
                    type="button"
                    className="chrome-btn xs"
                    aria-pressed={editingItem === item.id}
                    aria-label={`Change ${name}`}
                    title="Change its name, how many, where it is kept or its charges"
                    onClick={() => setEditingItem(editingItem === item.id ? null : item.id)}
                  >
                    <Icon name="pencil" />
                  </button>
                  <button
                    type="button"
                    className="chrome-btn xs"
                    aria-label={`Remove ${name}`}
                    title="Remove from the sheet"
                    onClick={() => removeFrom('equipment', item.id, name)}
                  >
                    <Icon name="close" />
                  </button>
                </>
              )
            }
            below={
              save &&
              editingItem === item.id && (
                <ItemEditor
                  item={item}
                  places={allPlaces}
                  onChange={(patch) => patchItem(item.id, patch)}
                  onDone={() => setEditingItem(null)}
                />
              )
            }
          />
        );
      };
      return (
        <Section
          title="Equipment"
          solo
          className="sh-gear"
          meta={
            <>
              {addButton('item')}
              {coinsText(sheet) && (
                <span className="sh-kv">
                  <span className="k">Coins</span>
                  <span className="num">{coinsText(sheet)}</span>
                </span>
              )}
              {attunable && (
                <span
                  className={`sh-kv${attuned > 3 ? ' over' : ''}`}
                  title={attuned > 3 ? 'A character attunes to at most three items' : undefined}
                >
                  <span className="k">Attuned</span>
                  <span className="num">{attuned} of 3</span>
                </span>
              )}
            </>
          }
        >
          {adding === 'item' && (
            <AddPanel kind="item" onAdd={addItem} onClose={() => setAdding(null)} />
          )}
          {sheet.equipment.length === 0 && (
            <p className="muted small">No equipment on this sheet yet.</p>
          )}
          {places.map((place) => {
            const items = sheet.equipment.filter((i) => placeOf(i) === place);
            return (
              <div key={place || 'on-you'} className="sh-place" data-testid="item-place">
                {/* Always named, so where things are kept is plain before any place is set. */}
                <h4 className="sh-place-head">
                  {place || 'On you'}
                  <span className="sh-lvl-count">{items.length}</span>
                </h4>
                <div className="sh-flow">{items.map(row)}</div>
              </div>
            );
          })}
        </Section>
      );
    })();

  const notes = character.notes.trim() && (
    <Section title="Notes" solo className="sh-notes-sec">
      <p className="sh-notes">{character.notes}</p>
    </Section>
  );

  const panel = (id: Group, body: ReactNode) => (
    <div
      className={`sh-grp sh-grp-${id}${shown === id ? ' on' : ''}`}
      role="tabpanel"
      aria-label={groups.find((g) => g.id === id)?.label ?? 'Abilities'}
    >
      <div className="sh-grp-in">{body}</div>
    </div>
  );

  return (
    <div
      ref={rootRef}
      className={`sh${pinned ? ' pinned' : ''}`}
      data-testid="sheet-view"
      style={{ '--tb-h': `${barHeight}px` } as CSSProperties}
    >
      <header className="sh-head">
        <div className="sh-id">
          <h2 className="sheet-view-name">{character.name}</h2>
          <p className="sh-sub">
            <span className="muted small">{sub}</span>
            {character.edition === '2014' && <span className="badge">legacy rules</span>}
          </p>
        </div>
        <div className="sh-actions">
          <SheetLink character={character} />
          {onEdit && (
            <button
              type="button"
              className="btn"
              aria-label={`Edit ${character.name}`}
              onClick={onEdit}
            >
              <Icon name="pencil" />
              Edit
            </button>
          )}
        </div>
      </header>

      {hasBar && (
        <div ref={barRef} className={`turnbar${live ? '' : ' no-live'}`}>
          {live}
          {rolls && (
            <div className="tb-mode">
              <span className="tb-label">Roll with</span>
              <span className="seg" role="group" aria-label="Roll with">
                {(
                  [
                    ['normal', 'Normal'],
                    ['advantage', 'Advantage'],
                    ['disadvantage', 'Disadvantage'],
                  ] as const
                ).map(([m, text]) => (
                  <button
                    key={m}
                    type="button"
                    className="btn"
                    aria-pressed={mode === m}
                    onClick={() => setMode(m)}
                  >
                    {text}
                  </button>
                ))}
              </span>
            </div>
          )}
          <Readout
            actor={rolls?.actor ?? character.name}
            event={event}
            onUndo={
              resources && event?.undo
                ? () => {
                    resources.onChange(event.undo!);
                    setEvent(null);
                  }
                : null
            }
          />
          {problem && (
            <p className="small join-problem tb-problem" role="alert">
              {problem}
            </p>
          )}
        </div>
      )}

      <div className="sh-vitals" role="group" aria-label="Numbers">
        <Vital
          label="AC"
          value={t.ac}
          extra={n?.ac.overridden && <HandMark />}
          {...(armourText(sheet) ? { title: armourText(sheet)! } : {})}
        />
        <Vital
          label="Max HP"
          value={t.maxHp}
          extra={
            tableHp &&
            tableHp.max !== t.maxHp && (
              <span
                className="badge"
                title={`The table uses ${tableHp.max} until your GM accepts the new number`}
              >
                table {tableHp.max}
              </span>
            )
          }
        />
        {roll ? (
          <button
            type="button"
            className="sh-vital rolls"
            aria-label="Roll Initiative"
            title={`Roll initiative: ${d20(t.initiativeBonus)}${
              rolls?.initiative || rolls?.onInitiative ? ', and enter it at the table' : ''
            }`}
            onClick={() => roll('Initiative', d20(t.initiativeBonus), true)}
          >
            <span className="sh-v-label">
              <Icon name="dice" size={12} />
              Initiative
              {n?.initiative.overridden && <HandMark />}
            </span>
            <span className="sh-v-val">{signed(t.initiativeBonus)}</span>
          </button>
        ) : (
          <Vital
            label="Initiative"
            value={signed(t.initiativeBonus)}
            extra={n?.initiative.overridden && <HandMark />}
          />
        )}
        <Vital
          label="Speed"
          value={
            <>
              {t.speed}
              <span className="sh-v-unit">ft</span>
            </>
          }
          extra={n?.speed.overridden && <HandMark />}
          {...(feet(sheet?.speeds)
            ? { title: `Walking ${t.speed} ft; ${feet(sheet?.speeds)}` }
            : {})}
        />
      </div>

      {sheet && defenceLines(sheet).length > 0 && (
        <dl className="sh-defs" aria-label="Defences and senses">
          {defenceLines(sheet).map((d) => (
            <div key={d.label}>
              <dt>{d.label}</dt>
              <dd>{d.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="sh-cols">
        <div className="sh-ref">
          {panel(
            'abilities',
            <>
              {abilities}
              {skills}
            </>,
          )}
        </div>
        <div className="sh-main">
          <span className="sh-anchor" ref={anchorRef} />
          <div className="sh-tabs">
            <SubTabs label="Sheet sections" tabs={groups} active={shown} onSelect={select} />
          </div>
          {panel('actions', actions)}
          {spells && panel('spells', spells)}
          {features && panel('features', features)}
          {equipment && panel('equipment', equipment)}
          {notes && panel('notes', notes)}
        </div>
      </div>
    </div>
  );
}

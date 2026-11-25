import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { blankSheet } from '@trifold/rules';
import type { Character, CompendiumRecord, Sheet } from '@trifold/schema';
import { useRollLogStore } from '../../stores/rollLogStore';
import { clearItemFacts } from './itemFacts';
import { clearSpellFacts } from './spellFacts';
import { SheetView } from './SheetView';

/** The character sheet's layout (ADR 0080): tabs, pips, slots by spell level, the readout. */

const now = '2026-11-24T00:00:00.000Z';

const cleric: Character = {
  schemaVersion: 1,
  id: 'K9',
  name: 'Maren',
  kind: 'trifold',
  edition: '2024',
  numbers: {
    classText: '',
    level: 1,
    maxHp: 10,
    ac: 10,
    initiativeBonus: 0,
    speed: 30,
    passives: { perception: 10, insight: 10, investigation: 10 },
    saves: {},
  },
  sheet: {
    ...blankSheet(),
    species: 'Dwarf',
    background: 'Acolyte',
    classes: [{ name: 'Cleric', subclass: 'Life Domain', level: 5 }],
    abilities: { str: 14, dex: 10, con: 14, int: 8, wis: 18, cha: 12 },
    saves: ['wis', 'cha'],
    skills: { medicine: 'proficient', religion: 'expertise' },
    spellcastingAbility: 'wis',
    slots: [4, 2],
    slotsUsed: [1],
    maxHp: 43,
    attacks: [
      {
        id: 'a1',
        name: 'Mace',
        ability: 'str',
        proficient: true,
        bonus: 0,
        damage: '1d6 bludgeoning',
      },
    ],
    features: [
      {
        id: 'f1',
        name: 'Channel Divinity',
        from: 'Cleric 2',
        text: 'Turn undead, or call on the domain.',
        uses: { max: 2, used: 1, reset: 'short' },
      },
    ],
    spells: [
      { id: 's1', name: 'Sacred Flame', level: 0, prepared: false },
      { id: 's2', name: 'Bless', level: 1, prepared: true },
      { id: 's3', name: 'Shield of Faith', level: 1, prepared: false },
      { id: 's4', name: 'Aid', level: 2, prepared: true },
    ],
    equipment: [
      { id: 'e1', name: 'Bolts', quantity: 20 },
      { id: 'e2', name: 'Holy Symbol', quantity: 1 },
    ],
    gp: 47,
  },
  notes: 'Owes the ferryman a favour.',
  createdAt: now,
  updatedAt: now,
};

/** The sheet with rolling and resources on, its sheet kept in state as the store keeps it. */
function AtTheTable({ seen, start = cleric }: { seen?(s: Sheet): void; start?: Character }) {
  const [character, setCharacter] = useState(start);
  return (
    <SheetView
      character={character}
      onEdit={() => undefined}
      rolls={{ actor: 'Maren' }}
      resources={{
        onChange: (sheet) => {
          setCharacter((c) => ({ ...c, sheet }));
          seen?.(sheet);
        },
      }}
    />
  );
}

beforeEach(() => {
  useRollLogStore.setState({ entries: [] } as never);
});

describe('the sheet’s tabs', () => {
  it('uses the app’s sub-tabs, with a tab only for what the sheet holds', async () => {
    const user = userEvent.setup();
    render(<SheetView character={cleric} />);
    const tabs = within(screen.getByRole('tablist', { name: 'Sheet sections' }));
    // A narrow sheet (and the test's, which has no width) keeps abilities in a tab.
    expect(tabs.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Actions',
      'Spells',
      'Abilities',
      'Features',
      'Equipment',
      'Notes',
    ]);
    expect(tabs.getByRole('tab', { name: 'Actions' })).toHaveAttribute('aria-selected', 'true');
    expect(tabs.getByRole('tab', { name: 'Actions' })).toHaveClass('subtab', 'active');
    await user.click(tabs.getByRole('tab', { name: 'Spells' }));
    expect(tabs.getByRole('tab', { name: 'Spells' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Spells' })).toHaveClass('on');
    expect(screen.getByRole('tabpanel', { name: 'Actions' })).not.toHaveClass('on');
  });

  it('leaves out tabs a blank sheet has nothing for, and says what to add', () => {
    render(
      <SheetView
        character={{ ...cleric, notes: '', sheet: blankSheet() }}
        onEdit={() => undefined}
      />,
    );
    const tabs = within(screen.getByRole('tablist', { name: 'Sheet sections' }));
    expect(tabs.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Actions', 'Abilities']);
    expect(screen.getByText('No attacks, spells, features or equipment yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add in Edit' })).toBeInTheDocument();
  });
});

describe('what can be pressed (ADR 0080)', () => {
  it('draws a read-only sheet with nothing pressable: plain numbers, inert pips, no turn bar', () => {
    render(<SheetView character={cleric} />);
    expect(screen.queryByRole('button', { name: /^Roll / })).toBeNull();
    expect(screen.queryByRole('button', { name: /available|used/ })).toBeNull();
    expect(screen.getByRole('group', { name: 'Level 1 slot: 3 of 4 left' })).toBeInTheDocument();
    expect(screen.queryByTestId('sheet-last-roll')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Cast / })).toBeNull();
  });

  it('makes rollable numbers buttons, and only the Initiative tile among the four', () => {
    render(<AtTheTable />);
    const numbers = within(screen.getByLabelText('Numbers'));
    expect(numbers.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Roll Initiative',
    ]);
    expect(screen.getByRole('button', { name: 'Roll Wisdom save' })).toHaveTextContent('+7');
    expect(screen.getByRole('button', { name: 'Roll Mace damage' })).toHaveTextContent('1d6');
    // Proficiency is a diamond with a title, not a pip.
    expect(screen.getByTitle('Expertise')).toHaveClass('sh-prof');
  });

  it('only lets a row light up when it opens or acts', () => {
    render(<SheetView character={cleric} />);
    const bolts = screen.getByText('Bolts').closest('.sh-row')!;
    expect(bolts).not.toHaveClass('acts');
    const channel = screen.getByRole('button', { name: 'Channel Divinity' }).closest('.sh-row')!;
    expect(channel).toHaveClass('acts');
  });
});

describe('spells', () => {
  it('groups spells by level, each with its own slots, prepared first', () => {
    render(<AtTheTable />);
    const one = within(screen.getByTestId('spell-level-1'));
    expect(one.getByText('3 of 4 slots')).toBeInTheDocument();
    expect(one.getAllByText(/^(Bless|Shield of Faith)$/).map((e) => e.textContent)).toEqual([
      'Bless',
      'Shield of Faith',
    ]);
    expect(one.getByText('not prepared')).toBeInTheDocument();
    // Cantrips are always ready, whatever the flag says.
    const cantrips = within(screen.getByTestId('spell-level-0'));
    expect(cantrips.getByText('At will')).toBeInTheDocument();
    expect(cantrips.queryByText('not prepared')).toBeNull();
  });

  it('casts with a slot of the spell’s level, says so, and undoes it', async () => {
    const seen = vi.fn();
    const user = userEvent.setup();
    render(<AtTheTable seen={seen} />);
    expect(
      screen.getByRole('button', { name: 'Cast Shield of Faith with a level 1 slot' }),
    ).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Cast Bless with a level 1 slot' }));
    expect(seen.mock.lastCall![0].slotsUsed).toEqual([2]);
    const readout = screen.getByTestId('sheet-last-roll');
    expect(readout).toHaveTextContent('Bless');
    expect(readout).toHaveTextContent('cast with a level 1 slot, 2 left');
    await user.click(within(readout).getByRole('button', { name: 'Undo' }));
    expect(seen.mock.lastCall![0].slotsUsed).toEqual([1]);
    expect(
      within(screen.getByTestId('spell-level-1')).getByText('3 of 4 slots'),
    ).toBeInTheDocument();
  });

  it('casts a cantrip without spending anything, and says so', async () => {
    const seen = vi.fn();
    const user = userEvent.setup();
    render(<AtTheTable seen={seen} />);
    await user.click(screen.getByRole('button', { name: 'Cast Sacred Flame' }));
    const readout = screen.getByTestId('sheet-last-roll');
    expect(readout).toHaveTextContent('Sacred Flame');
    expect(readout).toHaveTextContent('cast, a cantrip uses no slot');
    // Nothing changed, so nothing was saved and there is nothing to undo.
    expect(seen).not.toHaveBeenCalled();
    expect(within(readout).queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('hides unprepared spells on request and says how many', async () => {
    const user = userEvent.setup();
    render(<AtTheTable />);
    await user.click(screen.getByRole('button', { name: 'Show prepared spells only' }));
    const one = within(screen.getByTestId('spell-level-1'));
    expect(one.queryByText('Shield of Faith')).toBeNull();
    expect(one.getByText('1 more not prepared')).toBeInTheDocument();
  });
});

describe('the turn bar', () => {
  it('shows the last roll in one line, and the roll mode goes back to normal after it', async () => {
    const user = userEvent.setup();
    render(<AtTheTable />);
    expect(screen.getByTestId('sheet-last-roll')).toHaveTextContent('No rolls yet');
    await user.click(screen.getByRole('button', { name: 'Advantage' }));
    await user.click(screen.getByRole('button', { name: 'Roll Medicine check' }));
    const readout = screen.getByTestId('sheet-last-roll');
    expect(readout).toHaveTextContent('Medicine check');
    expect(readout).toHaveTextContent('1d20+7');
    expect(screen.getByRole('button', { name: 'Normal' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('equipment (docs/CHARACTER-SHEET.md, items 1 to 5, 20, 21)', () => {
  const record = (name: string, data: Record<string, unknown>) =>
    ({
      kind: 'item',
      key: name.toLowerCase(),
      name,
      displayName: name,
      data: {
        typeCode: 'G',
        magic: false,
        stealthDisadvantage: false,
        properties: [],
        text: '',
        ...data,
      },
    }) as unknown as CompendiumRecord;
  const records: Record<string, CompendiumRecord> = {
    'chain mail': record('Chain Mail', { typeCode: 'HA', ac: 16 }),
    shield: record('Shield', { typeCode: 'S', ac: 2 }),
    'ring of protection': record('Ring of Protection', {
      typeCode: 'RG',
      requiresAttunement: true,
    }),
  };
  const ref = (name: string) => ({ kind: 'item' as const, key: name.toLowerCase(), name });
  const armed: Character = {
    ...cleric,
    sheet: {
      ...cleric.sheet!,
      equipment: [
        { id: 'e1', name: 'Chain Mail', quantity: 1, ref: ref('Chain Mail') },
        { id: 'e2', name: 'Shield', quantity: 1, ref: ref('Shield') },
        { id: 'e3', name: 'Ring of Protection', quantity: 1, ref: ref('Ring of Protection') },
        { id: 'e4', name: 'Rope', quantity: 1, place: 'Backpack' },
        { id: 'e5', name: 'Wand', quantity: 1, uses: { max: 7, used: 2, reset: 'dawn' } },
      ],
      gp: 47,
      coins: { pp: 5, ep: 0, sp: 12, cp: 0 },
      defenses: { resist: ['poison'], immune: [], vulnerable: [], conditionImmune: [] },
      senses: { darkvision: 120 },
    },
  };

  beforeEach(() => {
    clearItemFacts();
    vi.mocked(window.trifold.compendium.findByKey).mockImplementation(async (_kind, key) => {
      const r = records[key];
      return r ? [r] : [];
    });
  });

  /** The AC tile's value. */
  const ac = () =>
    within(screen.getByLabelText('Numbers'))
      .getByText('AC')
      .closest('.sh-vital')!
      .querySelector('.sh-v-val')!;

  it('sets AC from the armour and shield equipped, read from their records', async () => {
    const user = userEvent.setup();
    render(<AtTheTable start={armed} />);
    // No armour setting and nothing equipped: 10 + Dex 0.
    expect(ac()).toHaveTextContent('10');
    await user.click(screen.getByRole('button', { name: 'Equip Chain Mail' }));
    await waitFor(() => expect(ac()).toHaveTextContent('16'));
    await user.click(screen.getByRole('button', { name: 'Equip Shield' }));
    await waitFor(() => expect(ac()).toHaveTextContent('18'));
    expect(screen.getByRole('button', { name: 'Equip Shield' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // Taken off again: the chain mail is known now, so nothing worn means unarmoured.
    await user.click(screen.getByRole('button', { name: 'Equip Chain Mail' }));
    await waitFor(() => expect(ac()).toHaveTextContent('12'));
  });

  it('offers attunement only for items that need it, and counts it against three', async () => {
    const user = userEvent.setup();
    render(<AtTheTable start={armed} />);
    // Attune keeps its place on every row, and is only live for what needs it.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Attune to Ring of Protection' })).toBeEnabled(),
    );
    expect(screen.getByRole('button', { name: 'Attune to Shield' })).toBeDisabled();
    const gear = within(screen.getByRole('tabpanel', { name: 'Equipment' }));
    expect(gear.getByText('0 of 3')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Attune to Ring of Protection' }));
    await waitFor(() => expect(gear.getByText('1 of 3')).toBeInTheDocument());
  });

  it('groups items by where they are kept, with coins and charges', () => {
    render(<AtTheTable start={armed} />);
    const places = screen.getAllByTestId('item-place');
    expect(places.map((p) => p.querySelector('h4')?.firstChild?.textContent)).toEqual([
      'On you',
      'Backpack',
    ]);
    expect(within(places[1]!).getByText('Rope')).toBeInTheDocument();
    expect(screen.getByText('5 PP · 47 GP · 12 SP')).toBeInTheDocument();
    expect(
      within(screen.getByRole('tabpanel', { name: 'Equipment' })).getByRole('group', {
        name: 'Wand charge: 5 of 7 left',
      }),
    ).toBeInTheDocument();
  });

  it('shows defences and senses under the tiles', () => {
    render(<SheetView character={armed} />);
    const defs = screen.getByLabelText('Defences and senses');
    expect(defs).toHaveTextContent('Resistantpoison');
    expect(defs).toHaveTextContent('Sensesdarkvision 120 ft');
    // Read only: equipped and attuned are words, not buttons.
    expect(screen.queryByRole('button', { name: /^Equip / })).toBeNull();
  });
});

describe('changing spells and equipment in their tabs (ADR 0082)', () => {
  const row = (name: string, kind: 'spell' | 'item', level: number | null = null) =>
    ({
      id: `r-${name}`,
      kind,
      key: name.toLowerCase(),
      name,
      displayName: name,
      sourceId: 'srd-2024',
      sourceName: 'SRD 5.2.1',
      edition: '2024',
      editions: ['2024'],
      otherVersions: [],
      cr: null,
      type: null,
      size: null,
      environment: null,
      isNpc: false,
      level,
      typeCode: null,
      rarity: null,
    }) as never;

  beforeEach(() => {
    clearItemFacts();
    vi.mocked(window.trifold.compendium.findByKey).mockResolvedValue([]);
    window.trifold.compendium.search = vi.fn(async (q: { kind: string; text?: string }) => ({
      rows:
        q.kind === 'spell' ? [row('Healing Word', 'spell', 1)] : [row('Potion of Healing', 'item')],
      total: 1,
      tookMs: 1,
    })) as never;
  });

  it('adds a spell from the compendium at its level, linked, and undoes it', async () => {
    const seen = vi.fn();
    const user = userEvent.setup();
    render(<AtTheTable seen={seen} />);
    await user.click(screen.getByRole('button', { name: 'Add a spell' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search spells to add' }), 'heal');
    await user.click(await screen.findByRole('button', { name: 'Add Healing Word' }));
    const added = seen.mock.lastCall![0].spells.at(-1);
    expect(added).toMatchObject({
      name: 'Healing Word',
      level: 1,
      prepared: true,
      ref: { kind: 'spell', key: 'healing word' },
    });
    expect(
      within(screen.getByTestId('spell-level-1')).getByText('Healing Word'),
    ).toBeInTheDocument();
    await user.click(
      within(screen.getByTestId('sheet-last-roll')).getByRole('button', { name: 'Undo' }),
    );
    expect(screen.queryByText('Healing Word')).toBeNull();
  });

  it('adds a spell as written at a chosen level', async () => {
    const seen = vi.fn();
    const user = userEvent.setup();
    render(<AtTheTable seen={seen} />);
    await user.click(screen.getByRole('button', { name: 'Add a spell' }));
    await user.type(
      screen.getByRole('searchbox', { name: 'Search spells to add' }),
      'Mote of Dust',
    );
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Level of the spell added as written' }),
      '2',
    );
    await user.click(screen.getByRole('button', { name: /Add “Mote of Dust” as written/ }));
    expect(seen.mock.lastCall![0].spells.at(-1)).toMatchObject({ name: 'Mote of Dust', level: 2 });
  });

  it('prepares, unprepares and removes a spell from its row', async () => {
    const seen = vi.fn();
    const user = userEvent.setup();
    render(<AtTheTable seen={seen} />);
    expect(screen.getByRole('button', { name: 'Prepare Sacred Flame' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Prepare Shield of Faith' }));
    expect(seen.mock.lastCall![0].spells.find((x: { id: string }) => x.id === 's3').prepared).toBe(
      true,
    );
    await user.click(screen.getByRole('button', { name: 'Remove Aid' }));
    expect(seen.mock.lastCall![0].spells.map((x: { name: string }) => x.name)).not.toContain('Aid');
  });

  it('adds an item, then moves it to a place and sets how many in place', async () => {
    const seen = vi.fn();
    const user = userEvent.setup();
    render(<AtTheTable seen={seen} />);
    await user.click(screen.getByRole('tab', { name: 'Equipment' }));
    await user.click(screen.getByRole('button', { name: 'Add an item' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search items to add' }), 'potion');
    await user.click(await screen.findByRole('button', { name: 'Add Potion of Healing' }));
    await user.click(screen.getByRole('button', { name: 'Change Potion of Healing' }));
    const editor = within(screen.getByRole('group', { name: 'Change Potion of Healing' }));
    await user.type(editor.getByRole('combobox', { name: 'Potion of Healing place' }), 'Backpack');
    const qty = editor.getByRole('spinbutton', { name: 'Potion of Healing quantity' });
    await user.clear(qty);
    await user.type(qty, '3');
    const potion = seen.mock.lastCall![0].equipment.at(-1);
    expect(potion).toMatchObject({ name: 'Potion of Healing', place: 'Backpack', quantity: 3 });
    const groups = () =>
      screen
        .getAllByTestId('item-place')
        .map((p) => p.querySelector('h4')?.firstChild?.textContent);
    // It stays where it was while being changed, so typing a place does not move it mid-word.
    expect(groups()).toEqual(['On you']);
    await user.click(editor.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('group', { name: 'Change Potion of Healing' })).toBeNull();
    expect(groups()).toEqual(['On you', 'Backpack']);
  });

  it('removes an item, and offers nothing to change on a read-only sheet', async () => {
    const seen = vi.fn();
    const user = userEvent.setup();
    const { unmount } = render(<AtTheTable seen={seen} />);
    await user.click(screen.getByRole('button', { name: 'Remove Bolts' }));
    expect(seen.mock.lastCall![0].equipment.map((x: { name: string }) => x.name)).toEqual([
      'Holy Symbol',
    ]);
    unmount();
    render(<SheetView character={cleric} />);
    expect(screen.queryByRole('button', { name: /^Add a/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Remove / })).toBeNull();
  });
});

describe('spells at the table (docs/CHARACTER-SHEET.md, items 13 to 15)', () => {
  const spellRecord = (name: string, level: number, duration: string, ritual = false) =>
    ({
      kind: 'spell',
      key: name.toLowerCase(),
      name,
      displayName: name,
      data: {
        level,
        school: 'EN',
        ritual,
        time: '1 action',
        range: '30 feet',
        components: 'V, S',
        duration,
        classes: [],
        text: '',
        rolls: [],
        modifiers: [],
        extra: {},
      },
    }) as unknown as CompendiumRecord;
  const records: Record<string, CompendiumRecord> = {
    bless: spellRecord('Bless', 1, 'Concentration, up to 1 minute'),
    guidance: spellRecord('Guidance', 0, 'Concentration, up to 1 minute'),
    'detect magic': spellRecord('Detect Magic', 1, 'Concentration, up to 10 minutes', true),
  };
  const ref = (name: string) => ({ kind: 'spell' as const, key: name.toLowerCase(), name });
  const linked: Character = {
    ...cleric,
    sheet: {
      ...cleric.sheet!,
      slots: [4, 2],
      slotsUsed: [1],
      spells: [
        { id: 's0', name: 'Guidance', level: 0, prepared: true, ref: ref('Guidance') },
        { id: 's1', name: 'Bless', level: 1, prepared: true, ref: ref('Bless') },
        { id: 's2', name: 'Detect Magic', level: 1, prepared: true, ref: ref('Detect Magic') },
        { id: 's3', name: 'Aid', level: 2, prepared: true },
      ],
    },
  };

  beforeEach(() => {
    clearSpellFacts();
    vi.mocked(window.trifold.compendium.findByKey).mockImplementation(async (_kind, key) => {
      const r = records[key];
      return r ? [r] : [];
    });
  });

  it('shows concentration, ritual, casting time and range on linked rows', async () => {
    render(<AtTheTable start={linked} />);
    const one = within(screen.getByTestId('spell-level-1'));
    await waitFor(() => expect(one.getAllByTitle('Needs concentration')).toHaveLength(2));
    expect(one.getAllByTitle('Can be cast as a ritual')).toHaveLength(1);
    expect(one.getAllByText('1 action · 30 feet')).toHaveLength(2);
    // An unlinked spell shows only what the sheet has.
    expect(
      within(screen.getByTestId('spell-level-2')).queryByTitle('Needs concentration'),
    ).toBeNull();
  });

  it('upcasts from the menu beside Cast, and says so', async () => {
    const seen = vi.fn();
    const user = userEvent.setup();
    render(<AtTheTable seen={seen} start={linked} />);
    await user.click(screen.getByRole('button', { name: 'Cast Detect Magic with a higher slot' }));
    await user.click(screen.getByRole('menuitem', { name: /Level 2 slot/ }));
    await waitFor(() => expect(seen.mock.lastCall![0].slotsUsed).toEqual([1, 1]));
    expect(screen.getByTestId('sheet-last-roll')).toHaveTextContent(
      'cast with a level 2 slot (upcast), 1 left',
    );
    // Aid is level 2, the highest slot there is: nothing higher to choose.
    expect(screen.getByRole('button', { name: 'Cast Aid with a higher slot' })).toBeDisabled();
  });

  it('casts with the next slot up when the spell’s own level is spent', () => {
    render(<AtTheTable start={{ ...linked, sheet: { ...linked.sheet!, slotsUsed: [4] } }} />);
    expect(screen.getByRole('button', { name: 'Cast Bless with a level 2 slot' })).toBeEnabled();
  });

  it('holds concentration in the turn bar; another concentration spell ends it; End ends it', async () => {
    const seen = vi.fn();
    const user = userEvent.setup();
    render(<AtTheTable seen={seen} start={linked} />);
    await user.click(screen.getByRole('button', { name: 'Cast Bless with a level 1 slot' }));
    const held = await screen.findByTestId('concentration');
    expect(held).toHaveTextContent('Bless');
    expect(within(held).getByRole('button', { name: 'Roll Concentration save' })).toHaveTextContent(
      '+2',
    );
    await user.click(screen.getByRole('button', { name: 'Cast Guidance' }));
    await waitFor(() => expect(screen.getByTestId('concentration')).toHaveTextContent('Guidance'));
    expect(screen.getByTestId('sheet-last-roll')).toHaveTextContent(
      'concentrating now, Bless ends',
    );
    await user.click(screen.getByRole('button', { name: 'End concentration on Guidance' }));
    expect(screen.queryByTestId('concentration')).toBeNull();
    expect(seen.mock.lastCall![0].concentrating).toBeUndefined();
  });
});

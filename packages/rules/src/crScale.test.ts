import { describe, expect, it } from 'vitest';
import {
  balancePlan,
  CR_BASELINE,
  multiattackCount,
  planFor,
  scaleCr,
  scaleDamageRoll,
  SCALE_PARTS,
  stepCr,
  tuneCr,
  typicalAttacks,
  type ScalableMonster,
  type ScalePart,
} from './crScale';

/** The CR scaler (ADR 0038): shift by the difference, HP and damage by a ratio, same dice. */
const ALL = new Set<ScalePart>(SCALE_PARTS);
const feature = (name: string, text: string) => ({ name, displayName: name, text });

function raider(): ScalableMonster {
  return {
    cr: '1',
    xp: 200,
    proficiencyBonus: 2,
    ac: { value: 13, note: 'leather armor' },
    hp: { average: 27, formula: '5d8 + 5' },
    saves: { dex: 4 },
    skills: { Perception: 2, Stealth: 4 },
    passivePerception: 12,
    traits: [feature('Pack Tactics', 'It has Advantage on an attack roll if an ally is near.')],
    actions: [
      feature('Spear', 'Melee Attack Roll: +4, reach 5 ft. Hit: 6 (1d8 + 2) Piercing damage.'),
      feature(
        'Howl',
        'Wisdom Saving Throw: DC 12, each creature in a 30-foot Emanation. Failure: 7 (2d6) Psychic damage.',
      ),
    ],
    bonusActions: [],
    reactions: [],
    legendary: { actions: [] },
    lair: [],
  };
}

describe('CR baselines', () => {
  it('rise with CR, and HP and damage climb faster past CR 20', () => {
    expect(CR_BASELINE.attack(5) - CR_BASELINE.attack(1)).toBeCloseTo(2.12);
    expect(CR_BASELINE.hp(1)).toBe(30);
    expect(CR_BASELINE.hp(22) - CR_BASELINE.hp(21)).toBeGreaterThan(
      CR_BASELINE.hp(10) - CR_BASELINE.hp(9),
    );
  });
});

describe('scaleDamageRoll', () => {
  it('keeps the die size, moves the modifier with the ability and adds dice for the rest', () => {
    // 1d6+2 (5.5) at 2.4 times, the modifier up 1: 2d6+3.
    expect(scaleDamageRoll(1, 6, 2, 2.4, 1)).toEqual({ count: 3, mod: 3, average: 13 });
    expect(scaleDamageRoll(2, 6, null, 2, 0)).toEqual({ count: 4, mod: 0, average: 14 });
    // Never below one die.
    expect(scaleDamageRoll(1, 4, 0, 0.1, 0).count).toBe(1);
  });
});

describe('CR baselines below CR 1 (ADR 0051)', () => {
  it('use the SRD values, meeting the lines at CR 1', () => {
    expect(CR_BASELINE.hp(0)).toBe(4);
    expect(CR_BASELINE.hp(0.5)).toBe(20);
    expect(CR_BASELINE.damage(0.25)).toBe(6);
    expect(CR_BASELINE.hp(1)).toBe(30);
    expect(CR_BASELINE.damage(1)).toBe(12);
  });
  it('give a typical number of attacks for each CR', () => {
    expect([0, 2, 3, 10, 11, 20].map(typicalAttacks)).toEqual([1, 1, 2, 2, 3, 3]);
  });
});

const avgHit = (text: string) => Number(/Hit: (\d+)/.exec(text)![1]);

describe('scaleCr', () => {
  it('scales every part up, with the same dice, the attacks of the new CR and the tag', () => {
    const { monster, lines, cr, offers } = scaleCr(raider(), '5', ALL, 'Raider');
    expect(cr).toBe('5');
    expect(offers).toEqual({ attacks: 'add', legendary: null, area: null });
    expect(monster).toMatchObject({
      cr: '5',
      xp: 1800,
      proficiencyBonus: 3,
      ac: { value: 15, note: 'leather armor' },
      hp: { average: 82, formula: '15d8 + 15' },
      saves: { dex: 5 },
      skills: { Perception: 3, Stealth: 5 },
      passivePerception: 13,
      scaled: { fromCr: '1', toCr: '5' },
    });
    // A CR 5 monster makes two attacks, each its own roll with half CR 5's damage per round.
    expect(monster.actions[0]).toMatchObject({
      name: 'Multiattack',
      text: 'The raider makes two Spear attacks.',
    });
    expect(monster.actions[1]!.text).toBe(
      'Melee Attack Roll: +6, reach 5 ft. Hit: 12 (2d8 + 3) Piercing damage.',
    );
    expect(monster.actions[2]!.text).toContain('DC 14');
    expect(monster.actions[2]!.text).toContain('21 (6d6) Psychic damage');
    // Traits without numbers are left alone.
    expect(monster.traits[0]).toEqual(raider().traits[0]);
    expect(lines.map((l) => l.part)).toEqual([
      'cr',
      'hp',
      'ac',
      'attacks',
      'damage',
      'damage',
      'attack',
      'dc',
      'proficiency',
    ]);
    expect(lines[0]).toMatchObject({ from: '1 (200 XP)', to: '5 (1,800 XP)' });
    expect(lines.find((l) => l.part === 'attacks')).toMatchObject({
      from: 'one attack',
      to: 'two attacks',
    });
  });

  it('leaves out the parts the DM unticks, and the CR drops with them (ADR 0048)', () => {
    const { monster, lines, cr } = scaleCr(raider(), '5', new Set<ScalePart>(['hp']));
    // Only hit points at CR 5's: 1 + 0.35 × 4 = 2.4, so CR 2.
    expect(cr).toBe('2');
    expect(monster.ac?.value).toBe(13);
    expect(monster.actions[0]!.text).toContain('+4');
    expect(lines.map((l) => l.part)).toEqual(['cr', 'hp']);
    // Leave the extra attack out and the spear keeps its share: less damage, a lower CR.
    const without = new Set(ALL);
    without.delete('attacks');
    const one = scaleCr(raider(), '5', without, 'Raider');
    expect(avgHit(one.monster.actions[0]!.text)).toBe(12);
    expect(one.cr).toBe('4');
    expect(one.monster).toMatchObject({ cr: '4', xp: 1100, scaled: { fromCr: '1', toCr: '4' } });
  });

  it('scales down too, and back to where it started drops the tag', () => {
    const down = scaleCr(raider(), '0', ALL).monster;
    expect(down.hp!.average).toBeLessThan(27);
    expect(down.actions[0]!.text).toMatch(/\+3, reach/);
    const up = scaleCr(raider(), '5', ALL).monster;
    const back = scaleCr(up, '1', ALL).monster;
    expect(back.scaled).toBeUndefined();
    expect(scaleCr(up, '8', ALL).monster.scaled).toEqual({ fromCr: '1', toCr: '8' });
  });

  it('reads the 2014 phrasing too', () => {
    const m = raider();
    m.actions = [
      feature(
        'Bite',
        'Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 7 (2d4+2) piercing damage. The target must succeed on a DC 11 Constitution saving throw.',
      ),
    ];
    const text = scaleCr(m, '3', ALL).monster.actions[1]!.text;
    expect(text).toMatch(/\+5 to hit/);
    expect(text).toMatch(/DC 12 Constitution/);
    expect(text).toMatch(/\d+ \(\d+d4\+3\) piercing/);
  });

  it('builds a tiny creature up properly: real low-end numbers, flat damage as dice', () => {
    const rat = raider();
    rat.cr = '0';
    rat.xp = 10;
    rat.hp = { average: 1, formula: '1d4 - 1' };
    rat.ac = { value: 10 };
    rat.actions = [feature('Bite', 'Melee Attack Roll: +2, reach 5 ft. Hit: 1 Piercing damage.')];
    const { monster, cr } = scaleCr(rat, '10', ALL, 'Rat');
    expect(cr).toBe('10');
    // Far from 15 × 11 = 165 (it is a frail creature still) but no longer a 11-HP CR 10; the
    // Constitution penalty is dropped going up.
    expect(monster.hp).toEqual({ average: 95, formula: '38d4' });
    expect(monster.actions[0]!.text).toBe('The rat makes two Bite attacks.');
    expect(monster.actions[1]!.text).toMatch(/Hit: \d+ \(\d+d6\) Piercing damage/);
    expect(avgHit(monster.actions[1]!.text)).toBeGreaterThan(15);
  });

  it('takes attacks and legendary actions away going below CR 10 (ADR 0051)', () => {
    const dragon = raider();
    dragon.cr = '15';
    dragon.xp = 13000;
    dragon.actions = [
      feature('Multiattack', 'The dragon makes three Rend attacks.'),
      feature('Rend', 'Melee Attack Roll: +12, reach 10 ft. Hit: 19 (2d10 + 8) Slashing damage.'),
    ];
    dragon.traits = [feature('Legendary Resistance (3/Day)', 'It succeeds instead.')];
    dragon.legendary = { perTurn: 3, actions: [feature('Pounce', 'It makes one Rend attack.')] };
    const r = scaleCr(dragon, '4', ALL, 'Dragon');
    expect(r.offers).toEqual({ attacks: 'remove', legendary: 'remove', area: null });
    expect(r.monster.actions[0]!.text).toBe('The dragon makes two Rend attacks.');
    expect(r.monster.legendary.actions).toEqual([]);
    expect(r.monster.traits).toEqual([]);
    expect(r.lines.find((l) => l.part === 'legendary')).toMatchObject({
      from: 'Pounce',
      to: 'none',
    });
    // Kept, they stay and are scaled with the rest.
    const keep = new Set(ALL);
    keep.delete('legendary');
    const kept = scaleCr(dragon, '4', keep, 'Dragon').monster;
    expect(kept.legendary.actions[0]!.name).toBe('Pounce');
    expect(kept.traits).toHaveLength(1);
    expect(multiattackCount('The raider makes Two Spear attacks.')).toBe(2);
  });

  it('adds legendary actions and an area attack going past CR 10, within the damage budget', () => {
    const r = scaleCr(raider(), '16', ALL, 'Raider');
    expect(r.cr).toBe('16');
    expect(r.offers).toEqual({ attacks: 'add', legendary: 'add', area: 'add' });
    expect(r.monster.legendary).toMatchObject({
      perTurn: 3,
      actions: [{ name: 'Strike', text: 'The raider makes one Spear attack.' }, { name: 'Shift' }],
    });
    expect(r.monster.legendary.header).toMatch(/^Legendary Action Uses: 3\./);
    // From CR 16, Legendary Resistance too.
    expect(r.monster.traits.map((t) => t.name)).toContain('Legendary Resistance (3/Day)');
    const burst = r.monster.actions.at(-1)!;
    expect(burst).toMatchObject({
      name: 'Piercing Burst (Recharge 5–6)',
      displayName: 'Piercing Burst',
    });
    expect(burst.text).toMatch(
      /^Dexterity Saving Throw: DC 20, each creature in a 20-foot Emanation originating from the raider\. Failure: \d+ \(\d+d6\) Piercing damage\. Success: Half damage\.$/,
    );
    // The legendary Strike takes its share of the damage: each spear hit is smaller, and with
    // the extras unticked the spear gets it back and the CR stays.
    const plain = new Set(ALL);
    plain.delete('legendary');
    plain.delete('area');
    const bare = scaleCr(raider(), '16', plain, 'Raider');
    expect(bare.cr).toBe('16');
    expect(bare.monster.legendary.actions).toEqual([]);
    expect(avgHit(r.monster.actions[1]!.text)).toBeLessThan(avgHit(bare.monster.actions[1]!.text));
    // A small step within CR 11+ offers nothing new.
    const twelve = scaleCr(raider(), '12', plain, 'Raider').monster;
    expect(scaleCr(twelve, '13', ALL, 'Raider').offers.legendary).toBeNull();
  });

  it('notes what it leaves alone', () => {
    const m = raider();
    m.spellcasting = { spells: ['fire bolt'] };
    m.traits.push(feature('Legendary Resistance (3/Day)', 'It succeeds instead.'));
    m.traits.push(feature('Regeneration', 'It regains 10 Hit Points at the start of its turn.'));
    const notes = scaleCr(m, '12', ALL).notes.join(' ');
    expect(notes).toContain('spells stay the same');
    expect(notes).toContain('Legendary Resistance');
    expect(notes).toContain('hit points regained');
  });

  it('does nothing for a CR it cannot read', () => {
    const m = raider();
    expect(scaleCr(m, 'x', ALL).monster).toBe(m);
  });
});

describe('tuneCr and balancePlan (ADR 0051)', () => {
  it('adds one attack and nothing else, and the CR climbs', () => {
    const plan = planFor(raider(), '1', new Set())!;
    expect(plan.levels.hp).toBe('1');
    const r = tuneCr(raider(), { ...plan, attacks: 2 }, 'Raider');
    expect(r.monster.actions[0]!.text).toBe('The raider makes two Spear attacks.');
    expect(r.monster.actions[1]).toEqual(raider().actions[0]);
    expect(r.cr).toBe('2');
  });

  it('trades damage for hit points and balances back to the CR', () => {
    const quick = planFor(raider(), '5', ALL)!;
    const tougher = { ...quick, levels: { ...quick.levels, hp: stepCr(stepCr('5', 1), 1) } };
    expect(tuneCr(raider(), tougher, 'Raider').cr).not.toBe('5');
    const balanced = balancePlan(raider(), tougher, 'damage', 'Raider');
    expect(balanced.levels.hp).toBe('7');
    expect(CR_ORDERED(balanced.levels.damage)).toBeLessThan(CR_ORDERED('5'));
    expect(tuneCr(raider(), balanced, 'Raider').cr).toBe('5');
  });

  it('steps along the CR list, held at the ends', () => {
    expect(stepCr('1/4', 1)).toBe('1/2');
    expect(stepCr('1', -1)).toBe('1/2');
    expect(stepCr('0', -1)).toBe('0');
    expect(stepCr('30', 1)).toBe('30');
  });
});

const CR_ORDERED = (cr: string) =>
  ['0', '1/8', '1/4', '1/2', ...Array.from({ length: 30 }, (_, i) => String(i + 1))].indexOf(cr);

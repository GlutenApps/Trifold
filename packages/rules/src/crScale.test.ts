import { describe, expect, it } from 'vitest';
import {
  CR_BASELINE,
  multiattackCount,
  scaleCr,
  scaleDamageRoll,
  SCALE_PARTS,
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

describe('scaleCr', () => {
  it('scales every part up, with the same dice and the tag', () => {
    const { monster, lines } = scaleCr(raider(), '5', ALL, 'Raider');
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
    expect(monster.actions[0]!.text).toBe(
      'Melee Attack Roll: +6, reach 5 ft. Hit: 21 (4d8 + 3) Piercing damage.',
    );
    expect(monster.actions[1]!.text).toContain('DC 14');
    expect(monster.actions[1]!.text).toContain('21 (6d6) Psychic damage');
    // Traits without numbers are left alone.
    expect(monster.traits[0]).toEqual(raider().traits[0]);
    expect(lines.map((l) => l.part)).toEqual([
      'cr',
      'hp',
      'ac',
      'damage',
      'damage',
      'attack',
      'dc',
      'proficiency',
    ]);
    expect(lines[0]).toMatchObject({ from: '1 (200 XP)', to: '5 (1,800 XP)' });
  });

  it('leaves out the parts the DM unticks', () => {
    const { monster, lines } = scaleCr(raider(), '5', new Set<ScalePart>(['hp']));
    expect(monster.ac?.value).toBe(13);
    expect(monster.actions[0]!.text).toContain('+4');
    expect(lines.map((l) => l.part)).toEqual(['cr', 'hp']);
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
    const text = scaleCr(m, '3', ALL).monster.actions[0]!.text;
    expect(text).toMatch(/\+5 to hit/);
    expect(text).toMatch(/DC 12 Constitution/);
    expect(text).toMatch(/\d+ \(\d+d4\+3\) piercing/);
  });

  it('offers one more attack at a big step up, and spreads the damage across them', () => {
    const plain = scaleCr(raider(), '5', ALL, 'Raider');
    expect(plain.attackOffer).toBe('add');
    const more = scaleCr(raider(), '5', new Set<ScalePart>([...ALL, 'attacks']), 'Raider');
    expect(more.monster.actions[0]).toMatchObject({
      name: 'Multiattack',
      text: 'The raider makes two Spear attacks.',
    });
    const avg = (text: string) => Number(/Hit: (\d+)/.exec(text)![1]);
    expect(avg(more.monster.actions[1]!.text)).toBeLessThan(avg(plain.monster.actions[0]!.text));
    expect(more.lines.find((l) => l.part === 'attacks')).toMatchObject({
      from: 'one attack',
      to: 'two attacks',
    });
    // A small step offers nothing.
    expect(scaleCr(raider(), '3', ALL).attackOffer).toBeNull();
  });

  it('takes an attack away at a big step down', () => {
    const m = raider();
    m.cr = '8';
    m.actions = [feature('Multiattack', 'The raider makes three Spear attacks.'), ...m.actions];
    const r = scaleCr(m, '2', new Set<ScalePart>([...ALL, 'attacks']));
    expect(r.attackOffer).toBe('remove');
    expect(r.monster.actions[0]!.text).toBe('The raider makes two Spear attacks.');
    expect(multiattackCount('The raider makes Two Spear attacks.')).toBe(2);
  });

  it('notes what it leaves alone', () => {
    const m = raider();
    m.spellcasting = { spells: ['fire bolt'] };
    m.traits.push(feature('Legendary Resistance (3/Day)', 'It succeeds instead.'));
    m.traits.push(feature('Regeneration', 'It regains 10 Hit Points at the start of its turn.'));
    const notes = scaleCr(m, '4', ALL).notes.join(' ');
    expect(notes).toContain('spells stay the same');
    expect(notes).toContain('Legendary Resistance');
    expect(notes).toContain('hit points regained');
  });

  it('does nothing for a CR it cannot read', () => {
    const m = raider();
    expect(scaleCr(m, 'x', ALL).monster).toBe(m);
  });
});

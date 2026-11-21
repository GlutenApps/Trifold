import { describe, expect, it } from 'vitest';
import {
  findAttacksInText,
  findSavesInText,
  multiattackReferences,
  parseAttackTriple,
} from './attacks';

describe('parseAttackTriple', () => {
  it('parses a full triple', () => {
    expect(parseAttackTriple('Bludgeoning Damage|+9|2d6+5')).toEqual({
      label: 'Bludgeoning Damage',
      toHit: 9,
      damage: '2d6+5',
    });
  });

  it('accepts a blank to-hit and compound dice', () => {
    expect(parseAttackTriple('Psychic Damage||3d6')).toEqual({
      label: 'Psychic Damage',
      damage: '3d6',
    });
    expect(parseAttackTriple('Bite|+5|(1d8+2)+(1d6)')).toEqual({
      label: 'Bite',
      toHit: 5,
      damage: '(1d8+2)+(1d6)',
    });
    expect(parseAttackTriple('Heal||1d10')).toEqual({ label: 'Heal', damage: '1d10' });
  });

  it('accepts to-hit-only triples and multipliers', () => {
    expect(parseAttackTriple('Spellcasting|+9|')).toEqual({ label: 'Spellcasting', toHit: 9 });
    expect(parseAttackTriple('Years||1d4x10')).toEqual({ label: 'Years', damage: '1d4x10' });
  });

  it('rejects malformed triples', () => {
    expect(parseAttackTriple('Bite|+5')).toBeNull();
    expect(parseAttackTriple('Bite|+5|lots')).toBeNull();
    expect(parseAttackTriple('Bite||')).toBeNull();
  });
});

describe('findAttacksInText', () => {
  it('parses the 2024 phrasing with secondary damage', () => {
    const text =
      'Melee Attack Roll: +7, reach 10 ft. Hit: 12 (2d6 + 5) Slashing damage plus 7 (2d6) Fire damage.';
    expect(findAttacksInText(text)).toEqual([
      {
        kind: 'melee',
        toHit: 7,
        reach: '10 ft',
        average: 12,
        damage: '2d6+5',
        damageType: 'slashing',
        extraDamage: [{ damage: '2d6', damageType: 'fire' }],
        index: 0,
      },
    ]);
  });

  it('parses the 2014 phrasing and ranged attacks', () => {
    const text =
      'Ranged Weapon Attack: +4 to hit, range 80/320 ft., one target. Hit: 5 (1d6 + 2) piercing damage.';
    expect(findAttacksInText(text)).toEqual([
      {
        kind: 'ranged',
        toHit: 4,
        range: '80/320 ft',
        average: 5,
        damage: '1d6+2',
        damageType: 'piercing',
        extraDamage: [],
        index: 0,
      },
    ]);
  });

  it('finds several attacks in one text, in order', () => {
    const text =
      'Melee or Ranged Weapon Attack: +5 to hit, reach 5 ft. or range 20/60 ft., one target. Hit: 6 (1d6 + 3) piercing damage. ' +
      'Melee Attack Roll: +5, reach 5 ft. Hit: 8 (2d4 + 3) Bludgeoning damage.';
    const attacks = findAttacksInText(text);
    expect(attacks.map((a) => a.toHit)).toEqual([5, 5]);
    expect(attacks[0]?.kind).toBe('melee or ranged');
    expect(attacks[1]?.damageType).toBe('bludgeoning');
  });

  it('accepts flat damage without a dice parenthetical', () => {
    const a = findAttacksInText(
      'Melee Weapon Attack: +0 to hit, reach 5 ft., one target. Hit: 1 piercing damage.',
    );
    expect(a[0]).toMatchObject({ toHit: 0, average: 1, damage: '1', damageType: 'piercing' });
    const b = findAttacksInText('Melee Attack Roll: +2, reach 5 ft. Hit: 1 Slashing damage.');
    expect(b[0]).toMatchObject({ toHit: 2, damage: '1', damageType: 'slashing' });
  });

  it('reads SRD 5.2 attacks that drop "Hit:" (flat and dice damage)', () => {
    expect(findAttacksInText('Melee Attack Roll: +2, reach 5 ft. 1 Piercing damage.')).toEqual([
      {
        kind: 'melee',
        toHit: 2,
        reach: '5 ft',
        average: 1,
        damage: '1',
        damageType: 'piercing',
        extraDamage: [],
        index: 0,
      },
    ]);
    const spider = findAttacksInText(
      'Melee Attack Roll: +4, reach 5 ft. 1 Piercing damage plus 2 (1d4) Poison damage.',
    );
    expect(spider[0]?.extraDamage).toEqual([{ damage: '1d4', damageType: 'poison' }]);
    const giantRat = findAttacksInText(
      'Melee Attack Roll: +5, reach 5 feet. 5 (1d4 + 3) Piercing damage.',
    );
    expect(giantRat[0]).toMatchObject({ toHit: 5, reach: '5 feet', damage: '1d4+3' });
  });

  it('reads a note after the bonus and "+4 to hit"', () => {
    const grappler = findAttacksInText(
      'Melee Attack Roll: +5 (with Advantage if the target is Grappled by the mimic), reach 5 ft. 7 (1d8 + 3) Piercing damage—or 12 (2d8 + 3) Piercing damage if the target is Grappled.',
    );
    expect(grappler).toHaveLength(1);
    expect(grappler[0]).toMatchObject({ toHit: 5, reach: '5 ft', damage: '1d8+3' });
    const bat = findAttacksInText('Melee Attack Roll: +4 to hit, reach 5 ft. 1 Piercing damage.');
    expect(bat[0]).toMatchObject({ toHit: 4, damage: '1', damageType: 'piercing' });
  });

  it('reads a 2024 reach-or-range attack', () => {
    const [hammer] = findAttacksInText(
      'Melee or Ranged Attack Roll: +4 (with Advantage if the target is Grappled by the bugbear), reach 10 ft. or range 20/60 ft. 9 (3d4 + 2) Bludgeoning damage.',
    );
    expect(hammer).toMatchObject({
      kind: 'melee or ranged',
      toHit: 4,
      reach: '10 ft. or range 20/60 ft',
      damage: '3d4+2',
      damageType: 'bludgeoning',
    });
  });

  it('keeps an attack that deals no damage as a to-hit roll', () => {
    const [tentacle] = findAttacksInText(
      'Melee Attack Roll: +7, reach 60 ft. The target has the Grappled condition (escape DC 14).',
    );
    expect(tentacle).toEqual({
      kind: 'melee',
      toHit: 7,
      reach: '60 ft',
      extraDamage: [],
      index: 0,
    });
  });

  it('returns nothing for non-attack text', () => {
    expect(
      findAttacksInText('The creature regains 10 hit points at the start of its turn.'),
    ).toEqual([]);
  });
});

describe('findSavesInText', () => {
  it('parses the 2024 phrasing with the half-damage clause', () => {
    const text =
      'Dexterity Saving Throw: DC 21, each creature in a 60-foot Cone. Failure: 56 (16d6) Fire damage. Success: Half damage.';
    expect(findSavesInText(text)).toEqual([
      { ability: 'dex', dc: 21, halfOnSuccess: true, index: 0 },
    ]);
  });

  it('parses the 2014 phrasing', () => {
    const text =
      'Each creature in that area must make a DC 15 Constitution saving throw, taking 22 (4d10) poison damage on a failed save, or half as much damage on a successful one.';
    expect(findSavesInText(text)).toEqual([
      { ability: 'con', dc: 15, halfOnSuccess: true, index: text.indexOf('DC 15') },
    ]);
    const frighten = 'The target must succeed on a DC 13 Wisdom saving throw or be frightened.';
    expect(findSavesInText(frighten)).toEqual([
      { ability: 'wis', dc: 13, halfOnSuccess: false, index: frighten.indexOf('DC 13') },
    ]);
  });
});

describe('multiattackReferences', () => {
  it('finds action names on word boundaries, in text order', () => {
    const text = 'The dragon makes three attacks: one with its Bite and two with its Claws.';
    expect(
      multiattackReferences(text, ['Multiattack', 'Bite', 'Claw', 'Tail', 'Fire Breath']),
    ).toEqual(['Bite', 'Claw']);
  });

  it('does not match inside other words', () => {
    expect(multiattackReferences('It makes two Rapier attacks.', ['Rapier', 'Rap'])).toEqual([
      'Rapier',
    ]);
  });
});

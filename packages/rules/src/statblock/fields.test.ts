import { describe, expect, it } from 'vitest';
import {
  parseAc,
  parseCreatureType,
  parseDamageList,
  parseHp,
  parseSaves,
  parseSkills,
  parseSlots,
  parseSpeed,
} from './fields';

describe('ac and hp', () => {
  it('parses ac with and without a note', () => {
    expect(parseAc('17')).toEqual({ value: 17 });
    expect(parseAc('15 (natural armor)')).toEqual({ value: 15, note: 'natural armor' });
    expect(parseAc('16 (chain mail, shield)')).toEqual({ value: 16, note: 'chain mail, shield' });
    expect(parseAc('')).toBeNull();
    expect(parseAc(undefined)).toBeNull();
  });

  it('parses hp with and without a formula', () => {
    expect(parseHp('150 (20d10+40)')).toEqual({ average: 150, formula: '20d10+40' });
    expect(parseHp('135 (18d10 + 36)')).toEqual({ average: 135, formula: '18d10+36' });
    expect(parseHp('7')).toEqual({ average: 7 });
    expect(parseHp('n/a')).toBeNull();
  });
});

describe('speed', () => {
  it('parses modes, bare walk speeds, hover and notes', () => {
    expect(parseSpeed('walk 30 ft., fly 60 ft. (hover)')).toMatchObject({
      walk: 30,
      fly: 60,
      hover: true,
      notes: [],
    });
    expect(parseSpeed('30 ft.')).toMatchObject({ walk: 30 });
    expect(parseSpeed('40 ft., swim 40 ft.')).toMatchObject({ walk: 40, swim: 40 });
    expect(parseSpeed('walk 30 ft., fly 30 ft. (Wasp only)')).toMatchObject({
      walk: 30,
      fly: 30,
      notes: ['fly: Wasp only'],
    });
    expect(parseSpeed('0 ft., fly 50 ft. (requires level 4+ spell)').notes).toEqual([
      'fly: requires level 4+ spell',
    ]);
    expect(parseSpeed('').raw).toBe('');
  });
});

describe('saves and skills', () => {
  it('parses save bonuses', () => {
    expect(parseSaves('Wis +6, Con +6, Dex +3')).toEqual({ wis: 6, con: 6, dex: 3 });
    expect(parseSaves('Str -1')).toEqual({ str: -1 });
    expect(parseSaves('')).toEqual({});
    expect(parseSaves('Luck +2')).toEqual({});
  });

  it('parses skill bonuses', () => {
    expect(parseSkills('Perception +10, Stealth +6')).toEqual({ Perception: 10, Stealth: 6 });
    expect(parseSkills('Sleight of Hand +4')).toEqual({ 'Sleight of Hand': 4 });
    expect(parseSkills(undefined)).toEqual({});
  });
});

describe('type and lists', () => {
  it('splits the creature type at the first parenthesis', () => {
    expect(parseCreatureType('humanoid (goblinoid)')).toEqual({
      type: 'humanoid',
      subtype: 'goblinoid',
    });
    expect(parseCreatureType('Aberration')).toEqual({ type: 'aberration' });
    expect(parseCreatureType('swarm of Tiny beasts')).toEqual({ type: 'swarm of tiny beasts' });
  });

  it('keeps qualified damage entries whole', () => {
    expect(
      parseDamageList('cold, fire; bludgeoning, piercing, and slashing from nonmagical attacks'),
    ).toEqual(['cold', 'fire', 'bludgeoning, piercing, and slashing from nonmagical attacks']);
    expect(parseDamageList('poison, psychic')).toEqual(['poison', 'psychic']);
    expect(parseDamageList('charmed, frightened, and prone')).toEqual([
      'charmed',
      'frightened',
      'prone',
    ]);
    expect(parseDamageList('')).toEqual([]);
  });

  it('parses spell slot lists starting with cantrips', () => {
    expect(parseSlots('0,4,3')).toEqual([0, 4, 3]);
    expect(parseSlots('4, 4, 3, 3, 3, 1')).toEqual([4, 4, 3, 3, 3, 1]);
    expect(parseSlots('')).toBeNull();
    expect(parseSlots('a,b')).toBeNull();
  });
});

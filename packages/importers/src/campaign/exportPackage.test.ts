import { describe, expect, it } from 'vitest';
import {
  Campaign,
  CampaignCounter,
  CampaignTimer,
  Encounter,
  Note,
  NPC,
  PCCard,
  PinnedRoll,
  Scene,
  type CombatState,
  type RecordRef,
} from '@trifold/schema';
import {
  filesOnlyLeftOutPcsUse,
  freshStart,
  homebrewIdsIn,
  importedSourceRefs,
  prepareExport,
  recordRefsIn,
  withNewIds,
  type CampaignParts,
} from './exportPackage';

const now = '2026-11-07T00:00:00.000Z';
const srdGoblin: RecordRef = {
  recordId: 'srd-2024:monster:goblin',
  sourceId: 'srd-2024',
  key: 'goblin',
  edition: '2024',
};
const importedOwlbear: RecordRef = {
  recordId: 'imp:owlbear',
  sourceId: '01JIMPORTED',
  key: 'owlbear',
  edition: '2024',
};
const homebrewWolf: RecordRef = {
  recordId: 'hb-dire-wolf',
  sourceId: 'homebrew',
  key: 'dire wolf',
  edition: '2024',
};

function parts(): CampaignParts {
  const state: CombatState = {
    round: 3,
    turnIndex: 1,
    startedAt: now,
    log: [],
    combatants: [
      {
        id: 'cb1',
        name: 'Owlbear',
        maskedName: 'Beast',
        revealed: true,
        ref: { kind: 'record', ref: importedOwlbear, name: 'Owlbear' },
        role: 'enemy',
        hidden: false,
        dead: false,
        initiative: 12,
        initiativeBonus: 1,
        hp: { current: 20, max: 59, temp: 0 },
        ac: 13,
        conditions: [{ id: 'k1', name: 'Grappled' }],
        counters: [],
        recharge: [],
      } as unknown as CombatState['combatants'][number],
    ],
  };
  return {
    campaign: Campaign.parse({
      schemaVersion: 1,
      id: 'CAMP',
      name: 'Sunken Keep',
      slug: 'sunken-keep',
      activeAdventureId: 'ADV',
      createdAt: now,
      updatedAt: now,
    }),
    pcs: [
      PCCard.parse({
        schemaVersion: 1,
        id: 'PC1',
        name: 'Thora',
        maxHp: 30,
        currentHp: 12,
        tempHp: 4,
        portrait: 'tokens/thora.png',
        createdAt: now,
        updatedAt: now,
      }),
    ],
    encounters: [
      Encounter.parse({
        schemaVersion: 1,
        id: 'ENC',
        name: 'Bridge ambush',
        combatants: [
          { id: 't1', ref: { kind: 'record', ref: srdGoblin, name: 'Goblin' }, quantity: 3 },
          { id: 't2', ref: { kind: 'pc', pcId: 'PC1', name: 'Thora' } },
        ],
        state,
        results: [{ endedAt: now, rounds: 2, xpEarned: 50, casualties: [] }],
        createdAt: now,
        updatedAt: now,
      }),
    ],
    adventures: [],
    notes: [
      Note.parse({
        schemaVersion: 1,
        id: 'NOTE',
        title: 'Session 1',
        links: [{ kind: 'npc', id: 'NPC', name: 'Varis' }],
        createdAt: now,
        updatedAt: now,
      }),
    ],
    npcs: [
      NPC.parse({
        schemaVersion: 1,
        id: 'NPC',
        name: 'Varis',
        recordRef: homebrewWolf,
        isAlive: false,
        hp: { current: 0, max: 37, temp: 0 },
        createdAt: now,
        updatedAt: now,
      }),
    ],
    scenes: [
      Scene.parse({
        schemaVersion: 1,
        id: 'SCN',
        kind: 'map',
        title: 'Bridge',
        encounterId: 'ENC',
        audio: { playlistId: 'PL', ambienceIds: ['AMB'] },
        tokens: [
          {
            id: 'tok',
            kind: 'creature',
            ref: { kind: 'npc', npcId: 'NPC', name: 'Varis' },
            label: 'Varis',
            x: 4.5,
            y: 7,
            dead: true,
          },
        ],
        createdAt: now,
        updatedAt: now,
      }),
    ],
    counters: [
      CampaignCounter.parse({
        schemaVersion: 1,
        id: 'CTR',
        name: 'Ritual rounds',
        showOnTv: true,
        initial: 5,
        value: 2,
        min: 0,
        createdAt: now,
        updatedAt: now,
      }),
    ],
    timers: [
      CampaignTimer.parse({
        schemaVersion: 1,
        id: 'TMR',
        name: 'Decide',
        durationSec: 60,
        createdAt: now,
        updatedAt: now,
      }),
    ],
    pinnedRolls: [
      PinnedRoll.parse({
        schemaVersion: 1,
        id: 'PIN',
        name: "Kael's stats",
        label: '4d6kh3',
        expression: '4d6kh3',
        total: 15,
        faces: '4d6: 6, 5, 4, 1 → 6, 5, 4',
        rolledAt: now,
        createdAt: now,
        updatedAt: now,
      }),
    ],
  };
}

describe('freshStart', () => {
  it('resets what play changed and keeps what the DM built', () => {
    const fresh = freshStart(parts());
    expect(fresh.campaign.activeAdventureId).toBeNull();
    expect(fresh.pcs[0]).not.toHaveProperty('currentHp');
    expect(fresh.pcs[0]).not.toHaveProperty('tempHp');
    expect(fresh.pcs[0]!.maxHp).toBe(30);
    expect(fresh.npcs[0]!.isAlive).toBe(true);
    expect(fresh.npcs[0]).not.toHaveProperty('hp');
    // The fight in progress ends without a result, its conditions with it.
    expect(fresh.encounters[0]!.state).toBeNull();
    expect(fresh.encounters[0]!.results).toEqual([]);
    expect(fresh.encounters[0]!.combatants).toHaveLength(2);
    // Token positions stay; only the dead mark goes.
    expect(fresh.scenes[0]!.tokens[0]).toMatchObject({ x: 4.5, y: 7, dead: false });
    // Counters go back to where they started; their bounds, step and place on the TV stay.
    expect(fresh.counters[0]).toMatchObject({
      value: 5,
      initial: 5,
      min: 0,
      step: 1,
      showOnTv: true,
    });
    // Timers are definitions only; a fresh start keeps them.
    expect(fresh.timers).toMatchObject([{ id: 'TMR', durationSec: 60, chime: true }]);
    // Pinned rolls are results of play.
    expect(fresh.pinnedRolls).toEqual([]);
    expect(
      prepareExport(parts(), { state: 'asIs', party: true, homebrew: true, layout: false })
        .pinnedRolls,
    ).toHaveLength(1);
  });
});

describe('prepareExport', () => {
  it('keeps the state as it is, including a fight with its conditions', () => {
    const out = prepareExport(parts(), {
      state: 'asIs',
      party: true,
      homebrew: true,
      layout: false,
    });
    expect(out.pcs[0]!.currentHp).toBe(12);
    expect(out.encounters[0]!.state?.round).toBe(3);
    expect(out.encounters[0]!.state?.combatants[0]!.conditions[0]).toMatchObject({
      id: 'k1',
      name: 'Grappled',
    });
    expect(out.scenes[0]!.tokens[0]!.dead).toBe(true);
  });

  it('leaves out the party when asked and always leaves out scene music', () => {
    const out = prepareExport(parts(), {
      state: 'fresh',
      party: false,
      homebrew: true,
      layout: false,
    });
    expect(out.pcs).toEqual([]);
    expect(out.scenes[0]).not.toHaveProperty('audio');
  });
});

describe('record references', () => {
  it('finds records wherever the campaign points at them', () => {
    const keys = recordRefsIn(parts())
      .map((r) => r.recordId)
      .sort();
    expect(keys).toEqual(['hb-dire-wolf', 'imp:owlbear', 'srd-2024:monster:goblin']);
  });

  it('tells homebrew, bundled and imported records apart', () => {
    expect(homebrewIdsIn(parts())).toEqual(['hb-dire-wolf']);
    expect(importedSourceRefs(parts()).map((r) => r.key)).toEqual(['owlbear']);
    // A fresh start drops the fight, and with it the only imported creature.
    expect(importedSourceRefs(freshStart(parts()))).toEqual([]);
  });
});

describe('filesOnlyLeftOutPcsUse', () => {
  it('drops a left-out PC portrait unless something kept still uses it', () => {
    const all = parts();
    const kept = prepareExport(all, { state: 'asIs', party: false, homebrew: true, layout: false });
    expect(filesOnlyLeftOutPcsUse(all, kept)).toEqual(['tokens/thora.png']);
    kept.npcs[0]!.portrait = 'tokens/thora.png';
    expect(filesOnlyLeftOutPcsUse(all, kept)).toEqual([]);
  });
});

describe('withNewIds', () => {
  it('gives every object a new id and follows it into every reference', () => {
    let n = 0;
    const copy = withNewIds(parts(), () => `NEW${(n += 1)}`);
    const oldIds = ['CAMP', 'PC1', 'ENC', 'NOTE', 'NPC', 'SCN', 'CTR', 'TMR'];
    const text = JSON.stringify(copy);
    for (const id of oldIds) expect(text).not.toContain(`"${id}"`);
    const npcId = copy.npcs[0]!.id;
    expect(copy.notes[0]!.links[0]!.id).toBe(npcId);
    expect(copy.scenes[0]!.tokens[0]!.ref).toMatchObject({ kind: 'npc', npcId });
    expect(copy.scenes[0]!.encounterId).toBe(copy.encounters[0]!.id);
    expect(copy.encounters[0]!.combatants[1]!.ref).toMatchObject({ pcId: copy.pcs[0]!.id });
    // Record references and inner ids (tokens, templates) are not campaign objects: unchanged.
    expect(copy.npcs[0]!.recordRef).toEqual(homebrewWolf);
    expect(copy.scenes[0]!.tokens[0]!.id).toBe('tok');
  });
});

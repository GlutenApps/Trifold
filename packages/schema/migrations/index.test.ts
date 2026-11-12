import { describe, expect, it } from 'vitest';
import { createMigrator, migrate, MigrationError, type MigrationRegistry } from './index';

const versions = {
  appConfig: 1,
  library: 4,
  source: 1,
  record: 1,
  campaign: 1,
  pc: 1,
  encounter: 1,
  adventure: 1,
  note: 1,
  npc: 1,
  scene: 1,
  musicLibrary: 1,
  playlist: 1,
  noteTemplate: 1,
  counter: 1,
  timer: 1,
  pinnedRoll: 1,
};
const registry: MigrationRegistry = {
  appConfig: [],
  library: [
    { from: 1, to: 2, migrate: (d) => ({ ...d, theme: 'dark' }) },
    { from: 2, to: 3, migrate: (d) => ({ ...d, backups: { enabled: true, keepDays: 14 } }) },
    { from: 3, to: 4, migrate: (d) => ({ ...d, workspace: { presets: [] } }) },
  ],
  source: [],
  record: [],
  campaign: [],
  pc: [],
  encounter: [],
  adventure: [],
  note: [],
  npc: [],
  scene: [],
  musicLibrary: [],
  playlist: [],
  noteTemplate: [],
  counter: [],
  timer: [],
  pinnedRoll: [],
};
const run = createMigrator(registry, versions);

describe('migrate', () => {
  it('returns a current document unchanged, as a copy', () => {
    const doc = { schemaVersion: 1, libraryPath: null };
    expect(migrate('appConfig', doc)).toEqual(doc);
    expect(migrate('appConfig', doc)).not.toBe(doc);
  });

  it('chains forward migrations and stamps the final version', () => {
    expect(run('library', { schemaVersion: 1 })).toEqual({
      schemaVersion: 4,
      theme: 'dark',
      backups: { enabled: true, keepDays: 14 },
      workspace: { presets: [] },
    });
  });

  it('treats a missing schemaVersion as version 1', () => {
    expect(run('library', {})).toMatchObject({ schemaVersion: 4, theme: 'dark' });
  });

  it('refuses documents from a newer app', () => {
    expect(() => run('library', { schemaVersion: 5 })).toThrow(MigrationError);
  });

  it('fails loudly when a step is missing', () => {
    const broken = createMigrator({ ...registry, library: [] }, versions);
    expect(() => broken('library', { schemaVersion: 1 })).toThrow(/no migration/);
  });

  it('resets saved layouts when the Combat tab folds into Encounters (library 2 → 3)', () => {
    const old = {
      schemaVersion: 2,
      theme: 'light',
      workspace: {
        presets: [{ name: 'Mine', layout: { stage: { groups: [{ tabs: ['combat'] }] } } }],
        seeded: true,
        consoles: { keep: { stage: { groups: [{ tabs: ['combat'] }] } } },
      },
    };
    expect(migrate('library', old)).toEqual({
      schemaVersion: 5,
      theme: 'light',
      workspace: { presets: [], seeded: false, consoles: {} },
    });
  });

  it('drops the TV controls dock section but keeps the rest of a layout (library 3 → 4)', () => {
    const dock = {
      state: 'narrow',
      width: 300,
      sections: [
        { tool: 'tv', open: true },
        { tool: 'scenes', open: true },
        { tool: 'music', open: false },
      ],
    };
    const stage = { groups: [{ tabs: ['map'], active: 'map' }], split: 0.5, maximized: null };
    const old = {
      schemaVersion: 3,
      workspace: {
        presets: [{ name: 'Mine', layout: { stage, dock } }],
        seeded: true,
        consoles: { keep: { stage, dock } },
      },
    };
    const kept = {
      stage,
      dock: {
        ...dock,
        sections: [
          { tool: 'scenes', open: true },
          { tool: 'music', open: false },
        ],
      },
    };
    expect(migrate('library', old)).toEqual({
      schemaVersion: 5,
      workspace: {
        presets: [{ name: 'Mine', layout: kept }],
        seeded: true,
        consoles: { keep: kept },
      },
    });
  });

  it('drops the Dice, Hotkeys and Layouts dock sections when they become pop-ups (library 4 → 5)', () => {
    const dock = {
      state: 'wide',
      width: 400,
      sections: [
        { tool: 'dice', open: true },
        { tool: 'music', open: false },
        { tool: 'scenes', open: true },
        { tool: 'hotkeys', open: true },
        { tool: 'layouts', open: false },
      ],
    };
    const stage = {
      groups: [{ tabs: ['campaign'], active: 'campaign' }],
      split: 0.5,
      maximized: null,
    };
    const old = {
      schemaVersion: 4,
      workspace: {
        presets: [{ name: 'Mine', layout: { stage, dock } }],
        seeded: true,
        consoles: { keep: { stage, dock } },
      },
    };
    const kept = {
      stage,
      dock: {
        ...dock,
        sections: [
          { tool: 'music', open: false },
          { tool: 'scenes', open: true },
        ],
      },
    };
    expect(migrate('library', old)).toEqual({
      schemaVersion: 5,
      workspace: {
        presets: [{ name: 'Mine', layout: kept }],
        seeded: true,
        consoles: { keep: kept },
      },
    });
  });

  it('rejects non-objects', () => {
    expect(() => migrate('record', 'nope')).toThrow(MigrationError);
    expect(() => migrate('record', [1])).toThrow(MigrationError);
  });
});

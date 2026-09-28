import { describe, expect, it } from 'vitest';
import { defaultAppConfig } from './appConfig';
import { defaultLibrarySettings, LibrarySettings } from './library';
import { Source } from './source';

describe('LibrarySettings', () => {
  it('fills every default from just a schemaVersion', () => {
    expect(defaultLibrarySettings()).toEqual({
      schemaVersion: 1,
      indexVersion: 0,
      lastOpenCampaignSlug: null,
      theme: 'dark',
      playerDisplayId: null,
      checkForUpdates: false,
      edition2024Books: [],
      disabledSourceIds: [],
      backups: { enabled: true, keepDays: 14 },
    });
  });

  it('rejects an unknown schemaVersion', () => {
    expect(LibrarySettings.safeParse({ schemaVersion: 2 }).success).toBe(false);
  });

  it('keeps explicit values', () => {
    const parsed = LibrarySettings.parse({ schemaVersion: 1, theme: 'light', playerDisplayId: 42 });
    expect(parsed.theme).toBe('light');
    expect(parsed.playerDisplayId).toBe(42);
  });
});

describe('AppConfig', () => {
  it('has sane defaults', () => {
    expect(defaultAppConfig()).toEqual({
      schemaVersion: 1,
      libraryPath: null,
      recentLibraries: [],
      consoleWindow: null,
    });
  });
});

describe('Source', () => {
  it('accepts the documented shape from DATA-FORMATS.md §5.1', () => {
    const parsed = Source.parse({
      schemaVersion: 1,
      id: '01JABCDEFGHJKMNPQRSTVWXYZ0',
      name: 'My compendium',
      kind: 'xml',
      filePath: 'original.xml',
      fileHash: 'sha256:abc',
      enabled: true,
      defaultEdition: '2014',
      edition2024Books: ['Example Book (2024)'],
      license: { nonSrd: true, attribution: null },
      importedAt: '2026-09-27T18:42:00Z',
      recordCounts: { monster: 3, spell: 1 },
      warnings: ['1 monster missing cr'],
    });
    expect(parsed.importerVersion).toBe(0);
    expect(parsed.recordCounts.monster).toBe(3);
    expect(parsed.recordCounts.item).toBeUndefined();
  });

  it('rejects a non-ISO importedAt', () => {
    const result = Source.safeParse({
      schemaVersion: 1,
      id: 'x',
      name: 'x',
      kind: 'xml',
      license: { nonSrd: false },
      importedAt: 'yesterday',
    });
    expect(result.success).toBe(false);
  });
});

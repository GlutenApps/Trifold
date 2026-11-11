import { describe, expect, it } from 'vitest';
import { AppConfig, defaultAppConfig } from './appConfig';
import {
  defaultLibrarySettings,
  isMajorKind,
  isWebTabKey,
  isWebUrl,
  normalizeWebUrl,
  LibrarySettings,
  ShellLayout,
  StageGroup,
  WebTab,
  webTabId,
  webTabKey,
} from './library';
import { NPC, PCCard, Scene } from './campaign';
import { Source } from './source';

describe('LibrarySettings', () => {
  it('fills every default from just a schemaVersion', () => {
    expect(defaultLibrarySettings()).toEqual({
      schemaVersion: 5,
      indexVersion: 0,
      lastOpenCampaignSlug: null,
      theme: 'dark',
      playerDisplayId: null,
      checkForUpdates: false,
      edition2024Books: [],
      disabledSourceIds: [],
      backups: { enabled: true, keepDays: 14 },
      music: {
        outputDeviceId: null,
        masterVolume: 0.8,
        musicVolume: 0.8,
        ambienceVolume: 0.6,
        sfxVolume: 0.8,
        crossfadeSec: 4,
      },
      workspace: { presets: [], seeded: false, consoles: {}, webTabs: [] },
      sampleCampaign: { added: false },
    });
  });

  it('rejects an unknown schemaVersion', () => {
    expect(LibrarySettings.safeParse({ schemaVersion: 6 }).success).toBe(false);
  });

  it('keeps explicit values', () => {
    const parsed = LibrarySettings.parse({ schemaVersion: 5, theme: 'light', playerDisplayId: 42 });
    expect(parsed.theme).toBe('light');
    expect(parsed.playerDisplayId).toBe(42);
  });
});

describe('ShellLayout tray (ADR 0023)', () => {
  const base = {
    stage: { groups: [{ tabs: ['campaign'], active: 'campaign' }] },
    dock: {},
  };

  it('gives a layout saved before the tray existed VTT, Music and Encounters', () => {
    expect(ShellLayout.parse(base).tray).toEqual(['map', 'music', 'encounters']);
  });

  it('drops unknown items, repeats and anything past the fourth instead of failing', () => {
    const tray = ['music', 'music', 'nonsense', 7, 'timer:01A', 'counter:01B', 'map', 'encounters'];
    expect(ShellLayout.parse({ ...base, tray }).tray).toEqual([
      'music',
      'timer:01A',
      'counter:01B',
      'map',
    ]);
  });

  it('keeps an empty tray empty', () => {
    expect(ShellLayout.parse({ ...base, tray: [] }).tray).toEqual([]);
  });
});

describe('AppConfig', () => {
  it('has sane defaults', () => {
    expect(defaultAppConfig()).toEqual({
      schemaVersion: 1,
      libraryPath: null,
      recentLibraries: [],
      consoleWindow: null,
      audioSource: 'computer',
      phoneAudioDevices: [],
      backupCopy: { folder: null, lastCopyAt: null, lastError: null },
    });
  });

  it('reads a config.json written before the backup copy folder existed', () => {
    const old = { schemaVersion: 1, libraryPath: 'D:\\Library' };
    expect(AppConfig.parse(old).backupCopy).toEqual({
      folder: null,
      lastCopyAt: null,
      lastError: null,
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
      schemaVersion: 2,
      id: 'x',
      name: 'x',
      kind: 'xml',
      license: { nonSrd: false },
      importedAt: 'yesterday',
    });
    expect(result.success).toBe(false);
  });
});

describe('Scene', () => {
  const base = {
    schemaVersion: 1,
    id: 's1',
    kind: 'map',
    title: 'Old mill',
    image: { path: 'images/a.png', displayPath: 'images/a.jpg', width: 1400, height: 1000 },
    createdAt: '2026-09-28T00:00:00.000Z',
    updatedAt: '2026-09-28T00:00:00.000Z',
  };

  it('reads a map saved before background variants existed', () => {
    const parsed = Scene.parse(base);
    expect(parsed.backgrounds).toBeUndefined();
    expect(parsed.image?.width).toBe(1400);
  });

  it('keeps background variants and the active one', () => {
    const parsed = Scene.parse({
      ...base,
      backgrounds: [
        { id: 'b1', name: 'Day', image: base.image },
        {
          id: 'b2',
          name: 'Night',
          image: { path: 'images/b.png', displayPath: 'images/b.jpg', width: 1400, height: 1000 },
        },
      ],
      activeBackgroundId: 'b2',
    });
    expect(parsed.backgrounds?.map((b) => b.name)).toEqual(['Day', 'Night']);
    expect(parsed.activeBackgroundId).toBe('b2');
  });
});

describe('stage tabs', () => {
  it('accepts majors and web tab keys, nothing else', () => {
    expect(StageGroup.parse({ tabs: ['campaign', 'web:01ARZ3'], active: 'web:01ARZ3' })).toEqual({
      tabs: ['campaign', 'web:01ARZ3'],
      active: 'web:01ARZ3',
    });
    expect(StageGroup.safeParse({ tabs: ['browser'] }).success).toBe(false);
    expect(StageGroup.safeParse({ tabs: ['web:'] }).success).toBe(false);
  });

  it('round-trips a web tab key', () => {
    const key = webTabKey('abc');
    expect(key).toBe('web:abc');
    expect(isWebTabKey(key)).toBe(true);
    expect(isWebTabKey('campaign')).toBe(false);
    expect(isMajorKind('campaign')).toBe(true);
    expect(isMajorKind(key)).toBe(false);
    expect(webTabId(key)).toBe('abc');
  });

  it('defaults a web tab to following the page title', () => {
    expect(WebTab.parse({ id: 'a', title: 'Docs', url: 'https://example.com' }).autoTitle).toBe(
      true,
    );
  });
});

describe('web URLs', () => {
  it('accepts http and https only', () => {
    expect(isWebUrl('https://example.com/doc')).toBe(true);
    expect(isWebUrl('http://localhost:8080')).toBe(true);
    expect(isWebUrl('file:///C:/secrets.txt')).toBe(false);
    expect(isWebUrl('javascript:alert(1)')).toBe(false);
    expect(isWebUrl('not a url')).toBe(false);
  });

  it('adds https to a bare host and keeps an explicit scheme', () => {
    expect(normalizeWebUrl('example.com/page')).toBe('https://example.com/page');
    expect(normalizeWebUrl('  http://example.com ')).toBe('http://example.com');
  });

  it('refuses blanks and non-web schemes', () => {
    expect(normalizeWebUrl('')).toBeNull();
    expect(normalizeWebUrl('file:///tmp/x')).toBeNull();
  });
});

describe('what a fight leaves behind (ADR 0012)', () => {
  const now = '2026-09-27T00:00:00.000Z';

  it('reads a PC card saved before current HP existed, and keeps one with it', () => {
    const base = { schemaVersion: 1, id: 'p', name: 'Thora', createdAt: now, updatedAt: now };
    expect(PCCard.parse(base)).toMatchObject({ maxHp: 10 });
    expect(PCCard.parse(base).currentHp).toBeUndefined();
    expect(PCCard.parse({ ...base, currentHp: 4, tempHp: 2 })).toMatchObject({
      currentHp: 4,
      tempHp: 2,
    });
  });

  it('keeps an NPC’s HP block only once it has fought', () => {
    const base = { schemaVersion: 1, id: 'n', name: 'Grak', createdAt: now, updatedAt: now };
    expect(NPC.parse(base).hp).toBeUndefined();
    expect(NPC.parse({ ...base, hp: { current: 3, max: 7 } }).hp).toEqual({
      current: 3,
      max: 7,
      temp: 0,
    });
  });
});

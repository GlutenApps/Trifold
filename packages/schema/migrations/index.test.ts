import { describe, expect, it } from 'vitest';
import { createMigrator, migrate, MigrationError, type MigrationRegistry } from './index';

const versions = { appConfig: 1, library: 3, source: 1, record: 1 };
const registry: MigrationRegistry = {
  appConfig: [],
  library: [
    { from: 1, to: 2, migrate: (d) => ({ ...d, theme: 'dark' }) },
    { from: 2, to: 3, migrate: (d) => ({ ...d, backups: { enabled: true, keepDays: 14 } }) },
  ],
  source: [],
  record: [],
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
      schemaVersion: 3,
      theme: 'dark',
      backups: { enabled: true, keepDays: 14 },
    });
  });

  it('treats a missing schemaVersion as version 1', () => {
    expect(run('library', {})).toMatchObject({ schemaVersion: 3, theme: 'dark' });
  });

  it('refuses documents from a newer app', () => {
    expect(() => run('library', { schemaVersion: 4 })).toThrow(MigrationError);
  });

  it('fails loudly when a step is missing', () => {
    const broken = createMigrator({ ...registry, library: [] }, versions);
    expect(() => broken('library', { schemaVersion: 1 })).toThrow(/no migration/);
  });

  it('rejects non-objects', () => {
    expect(() => migrate('record', 'nope')).toThrow(MigrationError);
    expect(() => migrate('record', [1])).toThrow(MigrationError);
  });
});

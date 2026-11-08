import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { IconTableSet } from '@trifold/rules';
import type { CompendiumRecord } from '@trifold/schema';
import {
  buildSampleCampaign,
  jpegSize,
  parseNoteFile,
  sampleId,
  type SampleInput,
} from './buildSample';

const ROOT = join(__dirname, '..', '..', '..', '..', 'samples', 'greyford');

/** Just enough of each SRD record the sample names (SRD-only, our own minimal stand-ins). */
const MONSTERS: Record<string, [string, string, string, number, string, number, number]> = {
  // id suffix: name, size, type, xp, cr, hp, ac
  'priest-acolyte': ['Priest Acolyte', 'S', 'humanoid', 50, '1/4', 11, 13],
  commoner: ['Commoner', 'S', 'humanoid', 10, '0', 4, 10],
  noble: ['Noble', 'S', 'humanoid', 25, '1/8', 9, 15],
  tough: ['Tough', 'S', 'humanoid', 100, '1/2', 32, 12],
  'bandit-captain': ['Bandit Captain', 'S', 'humanoid', 450, '2', 52, 15],
  'cultist-fanatic': ['Cultist Fanatic', 'S', 'humanoid', 450, '2', 44, 13],
  bandit: ['Bandit', 'S', 'humanoid', 25, '1/8', 11, 12],
  scout: ['Scout', 'S', 'humanoid', 100, '1/2', 16, 13],
  wolf: ['Wolf', 'M', 'beast', 50, '1/4', 11, 12],
  skeleton: ['Skeleton', 'M', 'undead', 50, '1/4', 13, 14],
  zombie: ['Zombie', 'M', 'undead', 50, '1/4', 15, 8],
  'swarm-of-rats': ['Swarm of Rats', 'M', 'beast', 50, '1/4', 14, 10],
  ghoul: ['Ghoul', 'M', 'undead', 200, '1', 22, 12],
  shadow: ['Shadow', 'M', 'undead', 100, '1/2', 27, 12],
  cultist: ['Cultist', 'S', 'humanoid', 25, '1/8', 9, 12],
};

function records(): Map<string, CompendiumRecord> {
  const out = new Map<string, CompendiumRecord>();
  for (const [slug, [name, size, type, xp, cr, hp, ac]] of Object.entries(MONSTERS)) {
    const id = `srd-2024:monster:srd-2024_${slug}`;
    out.set(id, {
      id,
      kind: 'monster',
      name,
      displayName: name,
      key: name.toLowerCase(),
      sourceId: 'srd-2024',
      edition: '2024',
      data: { size, type, xp, cr, hp: { average: hp }, ac: { value: ac } },
    } as unknown as CompendiumRecord);
  }
  return out;
}

const icons: IconTableSet = {
  creatureType: { undead: 'skull', beast: 'wolf-head', humanoid: 'person' },
  ancestry: {},
  nameKeywords: { wolf: 'wolf-head' },
  synonyms: {},
  itemType: {},
  spellSchool: {},
};

function input(overrides: Partial<SampleInput> = {}): SampleInput {
  const source = JSON.parse(readFileSync(join(ROOT, 'campaign.json'), 'utf8')) as {
    scenes: { image?: string; backgrounds?: { image: string }[] }[];
  };
  const imageSizes = new Map<string, { width: number; height: number }>();
  for (const s of source.scenes) {
    for (const path of [
      ...(s.image ? [s.image] : []),
      ...(s.backgrounds ?? []).map((b) => b.image),
    ]) {
      imageSizes.set(path, jpegSize(readFileSync(join(ROOT, path)))!);
    }
  }
  const notes = readdirSync(join(ROOT, 'notes'))
    .filter((f) => f.endsWith('.md'))
    .map((name) => ({ name, text: readFileSync(join(ROOT, 'notes', name), 'utf8') }));
  return {
    source,
    notes,
    imageSizes,
    records: records(),
    icons,
    availableIcons: new Set(['skull', 'wolf-head']),
    ...overrides,
  };
}

describe('sampleId', () => {
  it('is a stable 26-character ULID per key', () => {
    const a = sampleId('greyford:campaign');
    expect(a).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(sampleId('greyford:campaign')).toBe(a);
    expect(sampleId('greyford:npc-mara')).not.toBe(a);
  });
});

describe('parseNoteFile', () => {
  it('reads quoted titles, tags and an empty folder', () => {
    const note = parseNoteFile({
      name: 'x.md',
      text: '---\ntitle: "Part 1: Inn"\nfolder:\norder: 2\ntags: [a, b]\n---\nBody\n',
    });
    expect(note).toEqual({
      title: 'Part 1: Inn',
      folder: '',
      order: 2,
      tags: ['a', 'b'],
      body: 'Body\n',
    });
  });

  it('refuses a file without front matter', () => {
    expect(() => parseNoteFile({ name: 'x.md', text: '# Hi' })).toThrow('no front matter');
  });
});

describe('jpegSize', () => {
  it('reads the frame size of the sample maps and refuses other files', () => {
    expect(jpegSize(readFileSync(join(ROOT, 'images', 'village.jpg')))).toEqual({
      width: 3220,
      height: 2240,
    });
    expect(jpegSize(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
  });
});

describe('buildSampleCampaign', () => {
  it('builds every part of the Greyford sample', () => {
    const { parts, media } = buildSampleCampaign(input());
    expect(parts.campaign.name).toBe('The Lantern at Greyford');
    expect(parts.pcs).toHaveLength(4);
    expect(parts.npcs).toHaveLength(8);
    expect(parts.encounters).toHaveLength(4);
    expect(parts.scenes).toHaveLength(8);
    expect(parts.notes.filter((n) => n.kind === 'folder').map((n) => n.title)).toEqual([
      'Adventure',
      'World',
      'Sessions',
    ]);
    expect(parts.notes.find((n) => n.title === 'Start here')?.parentId).toBeNull();
    // One file per image (it is its own display copy, and a map shows its first background),
    // and every source exists.
    const images = parts.scenes.flatMap((s) =>
      s.backgrounds ? s.backgrounds.map((b) => b.image) : s.image ? [s.image] : [],
    );
    expect(media.map((m) => m.to).sort()).toEqual(images.map((i) => i.path).sort());
    for (const i of images) expect(i.displayPath).toBe(i.path);
    for (const m of media) expect(() => readFileSync(join(ROOT, m.from))).not.toThrow();
  });

  it('places the hidden tokens and ties them to their encounters', () => {
    const { parts } = buildSampleCampaign(input());
    const byTitle = new Map(parts.scenes.map((s) => [s.title, s]));
    expect(byTitle.get('The Wayside Lamp')!.tokens).toHaveLength(8);
    // Two fights share the gorge: the bridges (linked to the scene) and the keepers' rooms.
    expect(byTitle.get('Grey Gorge')!.tokens).toHaveLength(19);
    for (const scene of parts.scenes) {
      for (const t of scene.tokens) expect(t.hidden).toBe(true);
      if (scene.encounterId) {
        expect(parts.encounters.find((e) => e.id === scene.encounterId)!.sceneId).toBe(scene.id);
      }
      const linked = parts.encounters
        .filter((e) => e.sceneId === scene.id)
        .flatMap((e) => e.combatants.flatMap((c) => c.tokenIds ?? []));
      expect(linked.sort()).toEqual(scene.tokens.map((t) => t.id).sort());
    }
    const wolves = byTitle.get('Grey Gorge')!.tokens.filter((t) => t.ref.name === 'Wolf');
    expect(wolves.map((t) => t.label)).toEqual(['Wolf 1', 'Wolf 2', 'Wolf 3']);
    expect(wolves[0]).toMatchObject({ glyph: 'wolf-head', maskedLabel: 'Beast' });
    const flame = parts.encounters.find((e) => e.name === 'The still flame')!;
    expect(flame.sceneId).toBeUndefined();
  });

  it('shows the first background of a map, and refuses mismatched sizes', () => {
    const { parts } = buildSampleCampaign(input());
    const gorge = parts.scenes.find((s) => s.title === 'Grey Gorge')!;
    expect(gorge.backgrounds!.map((b) => b.name)).toEqual(['Low water', 'Flood']);
    expect(gorge.activeBackgroundId).toBe(gorge.backgrounds![0]!.id);
    expect(gorge.image).toEqual(gorge.backgrounds![0]!.image);

    const sizes = new Map(input().imageSizes);
    sizes.set('images/gorge-flood.jpg', { width: 4000, height: 1877 });
    expect(() => buildSampleCampaign(input({ imageSizes: sizes }))).toThrow('same size');
  });

  it('is repeatable byte for byte', () => {
    expect(JSON.stringify(buildSampleCampaign(input()))).toBe(
      JSON.stringify(buildSampleCampaign(input())),
    );
  });

  it('fails the build on a missing record or a miscounted placement', () => {
    const missing = records();
    missing.delete('srd-2024:monster:srd-2024_wolf');
    expect(() => buildSampleCampaign(input({ records: missing }))).toThrow('unknown record');

    const source = JSON.parse(readFileSync(join(ROOT, 'campaign.json'), 'utf8'));
    source.encounters[0].combatants[1].cells.pop();
    expect(() => buildSampleCampaign(input({ source }))).toThrow('cells for');
  });
});

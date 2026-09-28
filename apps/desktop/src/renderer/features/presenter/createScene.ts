import type { Scene } from '@trifold/schema';
import { useCampaignStore } from '../../stores/campaignStore';
import { useSceneStore } from '../../stores/sceneStore';
import { DEFAULT_BLANK, DEFAULT_GRID } from './mapMath';
import { nextOrder } from './sceneTree';

const DEFAULT_TITLES: Record<Scene['kind'], string> = {
  folder: 'New folder',
  title: 'New title card',
  image: 'New image scene',
  map: 'New map',
  blankGrid: 'Blank grid',
};

function nowIso(): string {
  return new Date().toISOString();
}

/** A new scene next to the selection (inside it when a folder is selected), then selects it. */
export async function createScene(kind: Scene['kind'], title: string): Promise<Scene | null> {
  const campaign = useCampaignStore.getState();
  const scenes = campaign.current?.scenes ?? [];
  const selected = scenes.find((s) => s.id === useSceneStore.getState().selectedId) ?? null;
  const parentId = selected?.kind === 'folder' ? selected.id : (selected?.parentId ?? null);
  const now = nowIso();
  const base: Scene = {
    schemaVersion: 1,
    id: '',
    kind,
    title: title.trim() || DEFAULT_TITLES[kind],
    subtitle: '',
    showTitleOverride: null,
    parentId,
    order: nextOrder(scenes, parentId),
    notes: '',
    tokens: [],
    entryMarkers: [],
    playerCamera: { mode: 'fitMap', x: 0, y: 0, zoom: 1 },
    createdAt: now,
    updatedAt: now,
  };
  if (kind === 'image' || kind === 'map') {
    const image = await campaign.importSceneImage();
    if (!image) return null;
    base.image = image;
  }
  if (kind === 'map' || kind === 'blankGrid') base.grid = { ...DEFAULT_GRID };
  if (kind === 'blankGrid') {
    base.blank = { ...DEFAULT_BLANK };
    base.backdrop = 'parchment';
  }
  const saved = await campaign.saveScene(base);
  if (saved) useSceneStore.getState().select(saved.id);
  return saved;
}

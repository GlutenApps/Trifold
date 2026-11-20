import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Playlist, Scene } from '@trifold/schema';
import { SceneEditor } from './SceneEditor';

/** Music on go-live (DESIGN.md §6.6): a playlist or a single track, and whether it loops. */
const scene = {
  schemaVersion: 1,
  id: 's1',
  kind: 'title',
  title: 'The inn',
  subtitle: '',
  showTitleOverride: null,
  tokens: [],
  entryMarkers: [],
  playerCamera: {},
  createdAt: '2026-11-20T00:00:00.000Z',
  updatedAt: '2026-11-20T00:00:00.000Z',
} as unknown as Scene;
const playlists = [{ id: 'p1', name: 'Tavern', trackIds: ['t1'], loop: false }] as Playlist[];
const tracks = [
  { id: 't1', title: 'Fireside', artist: 'Bard', kind: 'music' as const },
  { id: 't2', title: 'Door slam', kind: 'sfx' as const },
];

const setup = (s: Scene = scene) => {
  const onChange = vi.fn();
  render(
    <SceneEditor
      scene={s}
      playlists={playlists}
      tracks={tracks}
      onChange={onChange}
      onRemove={vi.fn()}
    />,
  );
  return { onChange, select: screen.getByLabelText('Music on go-live') as HTMLSelectElement };
};

describe('SceneEditor music on go-live', () => {
  it('offers playlists and tracks, leaving sound effects out', () => {
    const { select } = setup();
    const groups = within(select);
    expect(groups.getByRole('option', { name: 'Tavern' })).toBeTruthy();
    expect(groups.getByRole('option', { name: 'Fireside · Bard' })).toBeTruthy();
    expect(groups.queryByRole('option', { name: 'Door slam' })).toBeNull();
    // Nothing linked: no Loop switch.
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('links a single track, looping by default', () => {
    const { onChange, select } = setup();
    fireEvent.change(select, { target: { value: 't:t1' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ audio: { ambienceIds: [], trackId: 't1', loop: true } }),
    );
  });

  it('links a playlist with its own loop setting, and the switch overrides it for this scene', () => {
    const { onChange, select } = setup();
    fireEvent.change(select, { target: { value: 'p:p1' } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ audio: { ambienceIds: [], playlistId: 'p1', loop: false } }),
    );
  });

  it('shows Loop for a linked track and changes only the loop', () => {
    const { onChange } = setup({ ...scene, audio: { ambienceIds: [], trackId: 't1', loop: true } });
    const loop = screen.getByRole('checkbox', { name: 'Loop the track' });
    expect(loop).toBeChecked();
    fireEvent.click(loop);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ audio: { ambienceIds: [], trackId: 't1', loop: false } }),
    );
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import type { MapScene } from '@trifold/api';
import { describe, expect, it } from 'vitest';
import { MapLayer } from './MapLayer';

const scene: MapScene = {
  kind: 'map',
  id: 's1',
  title: 'Old mill',
  imageUrl: 'trifold-media://c/day.jpg',
  width: 1400,
  height: 1000,
  backdrop: 'dark',
  grid: { cellPx: 70, offsetX: 0, offsetY: 0, color: '#000', opacity: 0.3, visible: true },
  tokens: [],
  camera: { x: 0, y: 0, width: 1400, height: 1000 },
  tokenStyle: 'flat',
} as unknown as MapScene;

const images = () =>
  [...document.querySelectorAll('img.map-image')].map((img) => img.getAttribute('src'));

describe('MapLayer backgrounds', () => {
  it('fades a new background in over the old one, then drops the old one', () => {
    const { rerender } = render(<MapLayer scene={scene} combat={null} />);
    rerender(
      <MapLayer scene={{ ...scene, imageUrl: 'trifold-media://c/night.jpg' }} combat={null} />,
    );
    expect(images()).toEqual(['trifold-media://c/day.jpg', 'trifold-media://c/night.jpg']);
    fireEvent.transitionEnd(screen.getByTestId('map-image-incoming'));
    expect(images()).toEqual(['trifold-media://c/night.jpg']);
  });

  it('cuts straight to another scene without a fade', () => {
    const { rerender } = render(<MapLayer scene={scene} combat={null} />);
    rerender(
      <MapLayer
        scene={{ ...scene, id: 's2', imageUrl: 'trifold-media://c/cave.jpg' }}
        combat={null}
      />,
    );
    expect(images()).toEqual(['trifold-media://c/cave.jpg']);
  });
});

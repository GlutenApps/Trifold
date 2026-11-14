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

describe('MapLayer fog (ADR 0029)', () => {
  it('draws the fog opaque over the map, each shape cutting it or painting it back', () => {
    const { container, rerender } = render(<MapLayer scene={scene} combat={null} />);
    expect(screen.queryByTestId('fog')).toBeNull();
    rerender(
      <MapLayer
        scene={{
          ...scene,
          fog: {
            shapes: [
              { id: 'a', mode: 'reveal', kind: 'rect', x: 0, y: 0, w: 700, h: 500 },
              { id: 'b', mode: 'hide', kind: 'poly', points: [10, 10, 60, 10, 10, 60] },
            ],
          },
        }}
        combat={null}
      />,
    );
    const fog = screen.getByTestId('fog');
    expect(fog).not.toHaveClass('dm');
    const mask = container.querySelector('mask')!;
    // The whole fog first, then the reveal (black) and the hide (white), in order.
    expect([...mask.children].map((c) => `${c.tagName}:${c.getAttribute('fill')}`)).toEqual([
      'rect:white',
      'rect:black',
      'polygon:white',
    ]);
    expect(fog.querySelector('.fog-fill')).toHaveAttribute('mask', `url(#${mask.id})`);
  });
});

describe('MapLayer ruler (Beta 9)', () => {
  it("draws the DM's measurement on its own map only", () => {
    const ruler = { sceneId: 's1', from: { x: 35, y: 35 }, to: { x: 385, y: 245 }, squares: 5 };
    const { rerender } = render(<MapLayer scene={scene} combat={null} ruler={ruler} />);
    expect(screen.getByTestId('ruler-label')).toHaveTextContent('5 squares · 25 ft');
    rerender(<MapLayer scene={scene} combat={null} ruler={{ ...ruler, sceneId: 'other' }} />);
    expect(screen.queryByTestId('ruler-label')).toBeNull();
  });
});

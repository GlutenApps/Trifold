export type IconName =
  | 'campaign'
  | 'compendium'
  | 'encounters'
  | 'combat'
  | 'scenes'
  | 'music'
  | 'dice'
  | 'settings'
  | 'close'
  | 'maximize'
  | 'restore'
  | 'menu'
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'split'
  | 'fanout'
  | 'tv'
  | 'keys'
  | 'layout'
  | 'play'
  | 'pause'
  | 'prev'
  | 'next'
  | 'mute'
  | 'folder'
  | 'image'
  | 'grid'
  | 'card'
  | 'pencil'
  | 'trash'
  | 'plus'
  | 'undo'
  | 'send'
  | 'library'
  | 'collapse'
  | 'expand'
  | 'hand'
  | 'door'
  | 'camera'
  | 'party'
  | 'paw'
  | 'map';

/** Hand-drawn 24 px stroke glyphs; no icon dependency, so the chrome stays small and ours. */
const PATHS: Record<IconName, string> = {
  campaign: 'M4 19V6l8-3 8 3v13M4 19h16M12 3v16M8 10h.01M16 10h.01',
  compendium: 'M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4zM20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z',
  // One sword, blade drawn as an outline, so it never reads as the close X.
  encounters: 'M20 4v3.5L10 17.5 6.5 14 16.5 4zM5 12.5l6.5 6.5M8 16l-4 4',
  combat: 'M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6zM9 12l2 2 4-4',
  scenes: 'M3 5h18v11H3zM8 20h8M12 16v4',
  music:
    'M9 18V6l11-2v12M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM20 16a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z',
  dice: 'M12 2l9 5v10l-9 5-9-5V7zM12 2v20M3 7l9 5 9-5',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1l2-1.5-2-3.5-2.3 1a7 7 0 0 0-1.7-1L14.5 3h-5l-.4 2.5a7 7 0 0 0-1.7 1l-2.3-1-2 3.5 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.5 2.3-1a7 7 0 0 0 1.7 1l.4 2.5h5l.4-2.5a7 7 0 0 0 1.7-1l2.3 1 2-3.5-2-1.5c.1-.3.1-.7.1-1z',
  close: 'M6 6l12 12M18 6L6 18',
  maximize: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  restore: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',
  menu: 'M5 12h.01M12 12h.01M19 12h.01',
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  up: 'M5 15l7-7 7 7',
  down: 'M5 9l7 7 7-7',
  split: 'M4 4h16v16H4zM12 4v16',
  // One stem branching three ways: one roll dealt to several targets.
  fanout: 'M12 3v7M12 10l-7 8M12 10v10M12 10l7 8',
  tv: 'M3 5h18v11H3zM8 20h8',
  keys: 'M3 7h18v10H3zM7 11h.01M11 11h.01M15 11h.01M7 14h10',
  layout: 'M3 4h18v16H3zM3 12h18M12 12v8',
  play: 'M7 5l12 7-12 7z',
  pause: 'M7 5h4v14H7zM13 5h4v14h-4z',
  prev: 'M18 5L8 12l10 7zM5 5v14',
  next: 'M6 5l10 7-10 7zM19 5v14',
  mute: 'M4 9v6h4l5 4V5L8 9zM16 9l5 6M21 9l-5 6',
  folder: 'M3 6h6l2 2h10v11H3z',
  image: 'M4 5h16v14H4zM4 15l5-5 4 4 3-3 4 4M15 9h.01',
  grid: 'M4 4h16v16H4zM4 10h16M4 14h16M10 4v16M14 4v16',
  card: 'M3 6h18v12H3zM7 10h10M7 14h6',
  pencil: 'M4 20l4-1 11-11-3-3L5 16zM13 8l3 3',
  trash: 'M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  plus: 'M12 5v14M5 12h14',
  undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-2',
  send: 'M5 12h14M13 6l6 6-6 6',
  library: 'M4 4h4v16H4zM10 4h4v16h-4zM16 6l4-1 3 15-4 1z',
  collapse: 'M9 6l6 6-6 6M20 4v16',
  expand: 'M15 6l-6 6 6 6M4 4v16',
  hand: 'M8 13V6a1.5 1.5 0 0 1 3 0v5M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V5.5a1.5 1.5 0 0 1 3 0V12M17 12V8.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-1a6 6 0 0 1-4.6-2.2L4 15a1.6 1.6 0 0 1 2.4-2.1L8 14.5',
  door: 'M3 21h18M5 21V3h14v18M5 3l7 2.5V20l-7 1M10 12.5v.5',
  camera: 'M3 8h4l2-3h6l2 3h4v11H3zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  party:
    'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20a6 6 0 0 1 12 0M16 5.2a3 3 0 0 1 0 5.6M18 14.5a6 6 0 0 1 3 5.5',
  paw: 'M3.2 11a1.8 1.8 0 1 0 3.6 0 1.8 1.8 0 1 0-3.6 0zM7.2 6.5a1.8 1.8 0 1 0 3.6 0 1.8 1.8 0 1 0-3.6 0zM13.2 6.5a1.8 1.8 0 1 0 3.6 0 1.8 1.8 0 1 0-3.6 0zM17.2 11a1.8 1.8 0 1 0 3.6 0 1.8 1.8 0 1 0-3.6 0zM12 12c-3 0-6 4-6 6.5 0 1.5 1.2 2.5 2.7 2.5 1.2 0 2-.6 3.3-.6s2.1.6 3.3.6c1.5 0 2.7-1 2.7-2.5 0-2.5-3-6.5-6-6.5z',
  map: 'M3 6.5l6-2.5 6 2.5 6-2.5v13.5l-6 2.5-6-2.5-6 2.5zM9 4v13.5M15 6.5V20',
};

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

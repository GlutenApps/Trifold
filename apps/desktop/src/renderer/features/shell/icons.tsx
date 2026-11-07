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
  | 'fanout'
  | 'tv'
  | 'keys'
  | 'layout'
  | 'play'
  | 'pause'
  | 'prev'
  | 'next'
  | 'stop'
  | 'loop'
  | 'refresh'
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
  | 'map'
  | 'phone'
  | 'laptop'
  | 'layers'
  | 'window'
  | 'clapper'
  | 'bold'
  | 'italic'
  | 'strike'
  | 'list'
  | 'listOrdered'
  | 'checklist'
  | 'quote'
  | 'rule'
  | 'link'
  | 'search'
  | 'template'
  | 'globe'
  | 'external'
  | 'home'
  | 'tome'
  | 'person'
  | 'scroll'
  | 'quill'
  | 'crown'
  | 'potion'
  | 'coin'
  | 'compass'
  | 'skull'
  | 'gem'
  | 'star'
  | 'minus'
  | 'eye'
  | 'eyeOff'
  | 'mask'
  | 'maskOff'
  | 'skullOff'
  | 'linkOff';

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
  // One stem branching three ways: one roll dealt to several targets.
  fanout: 'M12 3v7M12 10l-7 8M12 10v10M12 10l7 8',
  tv: 'M3 5h18v11H3zM8 20h8',
  phone: 'M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2',
  laptop: 'M4 5h16v11H4zM2 19h20M10 8h4',
  // Three stacked sheets: the overlays that sit on the scene.
  layers: 'M12 3l9 4.5-9 4.5-9-4.5zM3 12l9 4.5 9-4.5M3 16.5L12 21l9-4.5',
  // A window with an arrow leaving it: the player window on the other display, not a send.
  window: 'M14 4h6v6M20 4l-8 8M10 6H4v14h14v-6',
  // A clapperboard: scenes in the film sense, ordered and cued.
  clapper: 'M3 10h18v10H3zM3 10l2-6h16l-2 6M8 4l2.5 6M13 4l2.5 6',
  keys: 'M3 7h18v10H3zM7 11h.01M11 11h.01M15 11h.01M7 14h10',
  layout: 'M3 4h18v16H3zM3 12h18M12 12v8',
  play: 'M7 5l12 7-12 7z',
  pause: 'M7 5h4v14H7zM13 5h4v14h-4z',
  // Seen by the players, or not: the tracker's and the map's shared hidden flag.
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeOff:
    'M3 3l18 18M10.5 5.2A11 11 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 3.9M6.6 6.6C3.8 8.6 2 12 2 12s4 7 10 7c1.5 0 2.9-.3 4.1-.8M9.9 9.9a3 3 0 0 0 4.2 4.2',
  prev: 'M18 5L8 12l10 7zM5 5v14',
  next: 'M6 5l10 7-10 7zM19 5v14',
  stop: 'M6 6h12v12H6z',
  refresh: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5',
  loop: 'M17 3l3 3-3 3M4 11V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3M20 13v2a3 3 0 0 1-3 3H4',
  mute: 'M4 9v6h4l5 4V5L8 9zM16 9l5 6M21 9l-5 6',
  folder: 'M3 6h6l2 2h10v11H3z',
  image: 'M4 5h16v14H4zM4 15l5-5 4 4 3-3 4 4M15 9h.01',
  grid: 'M4 4h16v16H4zM4 10h16M4 14h16M10 4v16M14 4v16',
  card: 'M3 6h18v12H3zM7 10h10M7 14h6',
  pencil: 'M4 20l4-1 11-11-3-3L5 16zM13 8l3 3',
  trash: 'M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
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
  // Formatting (the note editor's toolbar) and search.
  bold: 'M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z',
  italic: 'M10 5h8M6 19h8M14 5l-4 14',
  strike: 'M5 12h14M8 7.5c0-1.5 1.8-2.5 4-2.5s4 1 4 2.5M8 16.5c0 1.5 1.8 2.5 4 2.5s4-1 4-2.5',
  list: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
  listOrdered: 'M9 6h11M9 12h11M9 18h11M3.5 4.5h1v3M3 11h2l-2 2.5h2M3 15.5h2v4H3',
  checklist:
    'M9 6h11M9 12h11M9 18h11M3 6l1.2 1.2L6.5 4.5M3 12l1.2 1.2 2.3-2.7M3 18l1.2 1.2 2.3-2.7',
  quote: 'M6 7h4v4H6zM10 11c0 3-1.5 4.5-4 5M14 7h4v4h-4zM18 11c0 3-1.5 4.5-4 5',
  rule: 'M4 12h16M9 6h6M9 18h6',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.5 1.5M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  // A page with a folded corner and ruled lines: a note that starts filled in.
  template: 'M6 3h9l4 4v14H6zM15 3v4h4M9 12h6M9 16h6',
  // A globe: the web tab's mark on the stage (ADR 0011).
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  // An arrow leaving a box: open this page in the system browser.
  external: 'M14 4h6v6M20 4l-9 9M11 6H5v13h13v-6',
  // A house: back to the tab's saved address.
  home: 'M4 11l8-7 8 7M6 10v10h5v-6h2v6h5V10',
  // The marks a web tab can wear (WEB_TAB_ICONS); none is a tool's icon.
  tome: 'M6 3h12a1 1 0 0 1 1 1v16H8a2 2 0 0 1-2-2zM6 18a2 2 0 0 1 2-2h11M9.5 7h6',
  person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  scroll:
    'M5 6a2 2 0 0 1 4 0v12a2 2 0 0 1-4 0zM7 4h11a2 2 0 0 1 2 2v1h-4M9 20h8a2 2 0 0 0 2-2v-1h-4M11 10h6M11 13h6',
  quill: 'M20 4c-6 0-11 4-13 10l-3 6 6-3c6-2 10-7 10-13zM5 19l7-7',
  crown: 'M4 18h16l1-10-5 4-4-6-4 6-5-4zM4 18v2h16v-2',
  potion: 'M10 3h4M11 3v5l-5 8a3 3 0 0 0 2.6 4.5h6.8A3 3 0 0 0 18 16l-5-8V3M8 15h8',
  coin: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9z',
  compass: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM15.5 8.5l-2 5-5 2 2-5z',
  skull:
    'M12 3a7 7 0 0 0-7 7c0 2.5 1.2 4 2.5 5v3h9v-3c1.3-1 2.5-2.5 2.5-5a7 7 0 0 0-7-7zM9 11h.01M15 11h.01M10.5 18v3M13.5 18v3',
  gem: 'M7 4h10l4 5-9 12L3 9zM3 9h18M9 9l3 12M15 9l-3 12',
  star: 'M12 3l2.7 5.7 6.3.8-4.6 4.3 1.2 6.2L12 17l-5.6 3 1.2-6.2L3 9.5l6.3-.8z',
  // Masked name, or revealed: the tracker's and the map's name toggle, drawn like eye / eyeOff.
  mask: 'M2 9c3-2 7-2 10 0 3-2 7-2 10 0v3c0 3.5-2.5 6-5.5 6-2 0-3.5-1-4.5-2.5C11 17 9.5 18 7.5 18 4.5 18 2 15.5 2 12zM5.5 12.5a1.5 1 0 1 0 3 0 1.5 1 0 1 0-3 0zM15.5 12.5a1.5 1 0 1 0 3 0 1.5 1 0 1 0-3 0z',
  maskOff:
    'M3 3l18 18M2 9c3-2 7-2 10 0 3-2 7-2 10 0v3c0 3.5-2.5 6-5.5 6-2 0-3.5-1-4.5-2.5C11 17 9.5 18 7.5 18 4.5 18 2 15.5 2 12zM5.5 12.5a1.5 1 0 1 0 3 0 1.5 1 0 1 0-3 0zM15.5 12.5a1.5 1 0 1 0 3 0 1.5 1 0 1 0-3 0z',
  // Dead, or alive: the tracker's and the map's death toggle, drawn like eye / eyeOff.
  skullOff:
    'M3 3l18 18M12 3a7 7 0 0 0-7 7c0 2.5 1.2 4 2.5 5v3h9v-3c1.3-1 2.5-2.5 2.5-5a7 7 0 0 0-7-7zM9 11h.01M15 11h.01M10.5 18v3M13.5 18v3',
  // Linked, or not: the tracker's and the map's link toggle.
  linkOff:
    'M3 3l18 18M9.5 7.5l1.5-1.5a4 4 0 0 1 5.7 5.7l-1.5 1.5M14.5 16.5l-1.5 1.5a4 4 0 0 1-5.7-5.7l1.5-1.5',
};

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
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

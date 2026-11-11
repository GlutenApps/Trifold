import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { SEARCH_COMPACT_BELOW } from '../../stores/searchStore';
import { useShellStore, type PopKind } from '../../stores/shellStore';
import { DiceRoller } from '../dice/DiceRoller';
import { SearchResults } from './GlobalSearch';
import { HotkeysTool } from './HotkeysTool';
import { Icon, type IconName } from './icons';
import { LayoutsTool } from './LayoutsTool';
import { TrayTool } from './TrayTool';

/**
 * Pop-up tools (ADR 0009): Dice, the tray chooser (ADR 0023), Hotkeys and Layouts are anchored to the button that opens
 * them instead of taking a dock section. This file maps each kind to its body, title and icon
 * and places the one open pop-up; `Pop` below explains the anchoring. The global search's
 * results (ADR 0017) are a pop-up too, centred under the field in the top bar and without the
 * header, since the field is the heading; in a narrow window the field moves inside it.
 */

/** The heading each pop-up shows; the kinds are the shell store's `PopKind`. */
const POP_TITLES: Record<PopKind, string> = {
  dice: 'Dice',
  hotkeys: 'Hotkeys',
  layouts: 'Layouts',
  search: 'Search',
  tray: 'Tray',
};

const POP_ICON: Record<PopKind, IconName> = {
  dice: 'dice',
  hotkeys: 'keys',
  layouts: 'layout',
  search: 'search',
  tray: 'sliders',
};

function PopBody({ kind, compact }: { kind: PopKind; compact: boolean }) {
  switch (kind) {
    case 'dice':
      return <DiceRoller />;
    case 'hotkeys':
      return <HotkeysTool />;
    case 'layouts':
      return <LayoutsTool />;
    case 'search':
      return <SearchResults withField={compact} />;
    case 'tray':
      return <TrayTool />;
  }
}

/**
 * A tool that pops up from its own button (ADR 0009): Dice and the tray chooser above their strip buttons,
 * Hotkeys and Layouts below theirs in the top bar. The button carries `data-pop="<kind>"` and
 * the pop-up right-aligns to it. One at a time; Escape or a click elsewhere closes it.
 */
export function Pop() {
  const pop = useShellStore((s) => s.pop);
  const closePop = useShellStore((s) => s.closePop);
  const compact = useShellStore((s) => s.viewportWidth < SEARCH_COMPACT_BELOW);
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({});

  useLayoutEffect(() => {
    if (!pop) return;
    const place = () => {
      const rect = document.querySelector(`[data-pop="${pop}"]`)?.getBoundingClientRect();
      const anchored = rect && rect.width > 0 ? rect : null;
      const width = ref.current?.offsetWidth ?? 384;
      const right = anchored
        ? Math.max(12, Math.min(window.innerWidth - anchored.right, window.innerWidth - width - 12))
        : 12;
      if (pop === 'dice' || pop === 'tray') {
        setStyle({ right, bottom: anchored ? window.innerHeight - anchored.top + 6 : 42 + 10 });
      } else if (pop === 'search' && anchored && anchored.width > 60) {
        // Under the middle of the field; the icon button (compact) right-aligns like the rest.
        const left = Math.max(
          12,
          Math.min(anchored.left + anchored.width / 2 - width / 2, window.innerWidth - width - 12),
        );
        setStyle({ left, top: anchored.bottom + 6 });
      } else {
        setStyle({ right, top: anchored ? anchored.bottom + 6 : 34 + 8 });
      }
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [pop]);

  useEffect(() => {
    if (!pop) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (ref.current?.contains(t)) return;
      // The button that opened it toggles it closed itself.
      if (t.closest('[data-pop]')) return;
      closePop();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [pop, closePop]);

  if (!pop) return null;

  return (
    <div
      className="fly pop"
      ref={ref}
      style={style}
      role="dialog"
      aria-label={POP_TITLES[pop]}
      data-tool={pop}
      data-testid="pop"
    >
      {pop !== 'search' && (
        <header className="fly-head">
          <Icon name={POP_ICON[pop]} size={14} />
          <span className="dh-name">{POP_TITLES[pop]}</span>
          <span className="spacer" />
          <button
            type="button"
            className="chrome-btn xs"
            aria-label="Close pop-up"
            onClick={closePop}
          >
            <Icon name="close" />
          </button>
        </header>
      )}
      <div className={`fly-body${pop === 'search' ? ' search-body' : ''}`}>
        <PopBody kind={pop} compact={compact} />
      </div>
    </div>
  );
}

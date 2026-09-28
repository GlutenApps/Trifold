import { useEffect, useRef } from 'react';
import { MINOR_TITLES } from '../../stores/shellLayout';
import { useShellStore } from '../../stores/shellStore';
import { Icon } from './icons';
import { MINOR_ICON, MinorBody } from './minors';

/**
 * A minor opened while the dock shows icons only or is hidden (ADR 0004 §3.4): beside its icon,
 * or above the strip's section. One at a time; Escape closes it.
 */
export function Flyout() {
  const flyout = useShellStore((s) => s.flyout);
  const dock = useShellStore((s) => s.layout.dock);
  const effective = useShellStore((s) => s.effectiveDock)();
  const closeFlyout = useShellStore((s) => s.closeFlyout);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!flyout) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (ref.current?.contains(t)) return;
      if (t.closest('.dock, .strip, .topbar')) return;
      closeFlyout();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [flyout, closeFlyout]);

  if (!flyout || effective === 'wide' || effective === 'narrow') return null;
  const index = dock.sections.findIndex((s) => s.tool === flyout);
  const style =
    effective === 'icons'
      ? { right: 44 + 12, top: 34 + 8 + 36 + Math.max(0, index) * 32 }
      : { right: 12, bottom: 42 + 10 };

  return (
    <div className="fly" ref={ref} style={style} role="dialog" aria-label={MINOR_TITLES[flyout]}>
      <header className="fly-head">
        <Icon name={MINOR_ICON[flyout]} size={14} />
        <span className="dh-name">{MINOR_TITLES[flyout]}</span>
        <span className="spacer" />
        <button
          type="button"
          className="chrome-btn xs"
          aria-label="Close flyout"
          onClick={closeFlyout}
        >
          <Icon name="close" size={13} />
        </button>
      </header>
      <div className="fly-body">
        <MinorBody kind={flyout} />
      </div>
    </div>
  );
}

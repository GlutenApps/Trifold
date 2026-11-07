import { useEffect, useRef, type ReactNode } from 'react';

/**
 * A pop-up anchored to its trigger: beside the map tool strip, above the action bar, or below
 * the TV header. Not modal; a click elsewhere or Escape closes it.
 */
export function MapPop({
  open,
  onClose,
  label,
  side,
  trigger,
  children,
}: {
  open: boolean;
  onClose(): void;
  label: string;
  side: 'right' | 'up' | 'down' | 'down-left';
  trigger: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);
  return (
    <div className="map-pop-anchor" ref={ref}>
      {trigger}
      {open && (
        <div className={`map-pop ${side}`} role="dialog" aria-label={label}>
          {children}
        </div>
      )}
    </div>
  );
}

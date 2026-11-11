import { TRAY_MAX, type TrayItem, type TraySection } from '@trifold/schema';
import { useShellStore } from '../../stores/shellStore';
import { useCounters } from '../../stores/countersStore';
import { useTimers } from '../../stores/timersStore';
import { Icon, type IconName } from './icons';

/**
 * The tray chooser (ADR 0023), popped up from its button beside Dice: a checklist of what the
 * live strip shows, in three groups (table sections, counters, timers), up to four in all. Dice is always there and is not listed.
 * At four the unchecked boxes are disabled, and their tooltip says why.
 */

export const TRAY_SECTION_LABELS: Record<TraySection, { label: string; icon: IconName }> = {
  map: { label: 'VTT', icon: 'tv' },
  music: { label: 'Music', icon: 'music' },
  encounters: { label: 'Encounters', icon: 'combat' },
};

const FULL = `The tray holds ${TRAY_MAX}; uncheck one first`;

export function TrayTool() {
  const tray = useShellStore((s) => s.layout.tray);
  const setTrayItem = useShellStore((s) => s.setTrayItem);
  const timers = useTimers();
  const counters = useCounters();
  const full = tray.length >= TRAY_MAX;

  const option = (item: TrayItem, label: string, icon: IconName) => {
    const checked = tray.includes(item);
    const disabled = full && !checked;
    return (
      <li key={item}>
        <label className="field inline tray-option" title={disabled ? FULL : undefined}>
          <input
            type="checkbox"
            checked={checked}
            disabled={disabled}
            onChange={(e) => setTrayItem(item, e.target.checked)}
          />
          <Icon name={icon} size={14} />
          <span className="tray-option-name">{label}</span>
        </label>
      </li>
    );
  };

  return (
    <div className="tray-tool">
      <p className="muted small" data-testid="tray-count">
        {tray.length} of {TRAY_MAX} on the tray. Dice is always there.
      </p>
      <section aria-label="Table">
        <h3 className="tray-group">Table</h3>
        <ul className="tray-options">
          {(Object.keys(TRAY_SECTION_LABELS) as TraySection[]).map((s) =>
            option(s, TRAY_SECTION_LABELS[s].label, TRAY_SECTION_LABELS[s].icon),
          )}
        </ul>
      </section>
      <section aria-label="Counters">
        <h3 className="tray-group">Counters</h3>
        {counters.length === 0 ? (
          <p className="muted small">No counters in this campaign.</p>
        ) : (
          <ul className="tray-options">
            {counters.map((c) => option(`counter:${c.id}`, c.name, 'tally'))}
          </ul>
        )}
      </section>
      <section aria-label="Timers">
        <h3 className="tray-group">Timers</h3>
        {timers.length === 0 ? (
          <p className="muted small">No timers in this campaign.</p>
        ) : (
          <ul className="tray-options">
            {timers.map((t) => option(`timer:${t.id}`, t.name, 'stopwatch'))}
          </ul>
        )}
      </section>
    </div>
  );
}

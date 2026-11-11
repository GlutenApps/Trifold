import { useEffect } from 'react';
import {
  canAdjust,
  counterBound,
  formatClock,
  formatDurationLabel,
  remainingMs,
} from '@trifold/rules';
import type { CampaignCounter, CampaignTimer, MinorKind, TrayItem } from '@trifold/schema';
import { useCampaignStore } from '../../stores/campaignStore';
import { useCountersStore } from '../../stores/countersStore';
import { useShellStore } from '../../stores/shellStore';
import { useNow, useTimersStore } from '../../stores/timersStore';
import { Icon } from './icons';

/**
 * A counter or a timer on the tray (ADR 0023): a mirror of its row in the tool, with the actions
 * that matter at the table: − and + for a counter, the main button and Reset for a timer. Every button here is also in the tool; the accessible
 * names end in "(tray)" so the two never clash. Clicking the name opens the tool on that row.
 */

/** Opens a dock tool and focuses one row in it once it is on screen (a flyout takes a frame). */
function openRow(tool: MinorKind, selector: string) {
  useShellStore.getState().showTool(tool);
  let tries = 0;
  const look = () => {
    const el = document.querySelector<HTMLElement>(`[data-tool='${tool}'] ${selector}`);
    if (el) el.focus();
    else if (++tries < 20) requestAnimationFrame(look);
  };
  requestAnimationFrame(look);
}

export function TimerTraySection({ timer }: { timer: CampaignTimer }) {
  const run = useTimersStore((s) => s.runs[timer.id]);
  const runOf = useTimersStore((s) => s.runOf);
  const start = useTimersStore((s) => s.start);
  const pause = useTimersStore((s) => s.pause);
  const reset = useTimersStore((s) => s.reset);
  const current = run ?? runOf(timer);
  const now = useNow(current.status === 'running');
  const { name } = timer;
  const done = current.status === 'done';
  const main =
    current.status === 'running'
      ? { label: 'Pause', icon: 'pause' as const, act: () => pause(timer.id) }
      : current.status === 'paused'
        ? { label: 'Resume', icon: 'play' as const, act: () => start(timer.id) }
        : done
          ? { label: 'Start again', icon: 'play' as const, act: () => start(timer.id) }
          : { label: 'Start', icon: 'play' as const, act: () => start(timer.id) };
  return (
    <div
      className={`strip-sec tray-item status-${current.status}`}
      data-strip="timer"
      data-tray-id={timer.id}
    >
      <Icon name="stopwatch" size={15} />
      <button
        type="button"
        className="strip-text"
        title={`${name}: open in Timers`}
        onClick={() => openRow('timers', `[data-timer-id="${timer.id}"] .timer-main`)}
      >
        <span className="tray-item-name">{name}</span>
        <span className="tray-value">{formatClock(remainingMs(current, now))}</span>
      </button>
      <button
        type="button"
        className={`chrome-btn${current.status === 'running' ? ' primary' : ''}`}
        aria-label={`${main.label} ${name} (tray)`}
        title={main.label}
        onClick={main.act}
      >
        <Icon name={main.icon} />
      </button>
      <button
        type="button"
        className="chrome-btn"
        aria-label={`Reset ${name} to ${formatDurationLabel(timer.durationSec)} (tray)`}
        title={`Reset to ${formatClock(timer.durationSec * 1000)}`}
        disabled={current.status === 'idle'}
        onClick={() => reset(timer.id)}
      >
        <Icon name="undo" />
      </button>
    </div>
  );
}

export function CounterTraySection({ counter }: { counter: CampaignCounter }) {
  const adjust = useCountersStore((s) => s.adjust);
  const { name, step, value } = counter;
  const bound = counterBound(counter);
  const stepButton = (delta: number) => (
    <button
      type="button"
      className={`chrome-btn${canAdjust(counter, delta > 0 ? 1 : -1) ? '' : ' at-bound'}`}
      aria-label={`${delta > 0 ? `Add ${step} to` : `Take ${step} from`} ${name} (tray)`}
      title={delta > 0 ? `Add ${step}` : `Take ${step}`}
      onClick={() => adjust(counter.id, delta)}
    >
      <Icon name={delta > 0 ? 'plus' : 'minus'} />
    </button>
  );
  return (
    <div
      className={`strip-sec tray-item${bound ? ` at-${bound}` : ''}`}
      data-strip="counter"
      data-tray-id={counter.id}
    >
      <Icon name="tally" size={15} />
      <button
        type="button"
        className="strip-text"
        title={`${name}: open in Counters`}
        onClick={() => openRow('counters', `[data-counter-id="${counter.id}"] .counter-value`)}
      >
        <span className="tray-item-name">{name}</span>
      </button>
      {stepButton(-step)}
      <span className="tray-value">{value}</span>
      {stepButton(step)}
    </div>
  );
}

/**
 * Keeps the tray to what the open campaign has: a layout made in another campaign, or a
 * timer or counter removed outside the tool, drops out once the campaign's bundle is loaded.
 */
export function useTraySync(): void {
  const slug = useShellStore((s) => s.campaignSlug);
  const tray = useShellStore((s) => s.layout.tray);
  const current = useCampaignStore((s) => s.current);
  useEffect(() => {
    if (!current || current.campaign.slug !== slug) return;
    const timers = new Set(current.timers.map((t) => `timer:${t.id}`));
    const counters = new Set(current.counters.map((c) => `counter:${c.id}`));
    const keep = (item: TrayItem) => timers.has(item) || counters.has(item);
    if (tray.some((t) => (t.startsWith('timer:') || t.startsWith('counter:')) && !keep(t))) {
      useShellStore.getState().pruneTray(keep);
    }
  }, [slug, tray, current]);
}

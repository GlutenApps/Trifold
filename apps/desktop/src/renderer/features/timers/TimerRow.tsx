import { useState } from 'react';
import { formatClock, formatDurationLabel, remainingMs, type TimerRun } from '@trifold/rules';
import type { CampaignTimer } from '@trifold/schema';
import { Icon } from '../shell/icons';
import { InlineConfirm } from '../shell/InlineConfirm';

/**
 * One timer (ADR 0021), laid out like a counter: the name and its row actions (chime, show on
 * TV, reset, edit, delete) on the first line, always on screen and quiet until the row is in use
 * (ADR 0020); the time left and the one main button (Start, Pause, Resume, Start again) on the
 * second. At zero the row turns to its alert look and says so. Drawn from the timer, its run and
 * the clock; every change goes out through the callbacks.
 */
export interface TimerRowProps {
  timer: CampaignTimer;
  run: TimerRun;
  now: number;
  onStart(): void;
  onPause(): void;
  onReset(): void;
  onEdit(): void;
  onDelete(): void;
  onToggleTv(): void;
  onToggleChime(): void;
  /** The timer on the TV now, when it is another one: putting this one on replaces it. */
  tvTakenBy: string | null;
  dragProps?: Record<string, unknown>;
  dragClass?: string;
}

export function TimerRow({
  timer,
  run,
  now,
  onStart,
  onPause,
  onReset,
  onEdit,
  onDelete,
  onToggleTv,
  onToggleChime,
  tvTakenBy,
  dragProps,
  dragClass = '',
}: TimerRowProps) {
  const [confirming, setConfirming] = useState(false);
  const { name } = timer;
  const left = remainingMs(run, now);
  const done = run.status === 'done';
  const onTv = !!timer.showOnTv;

  const main =
    run.status === 'running'
      ? { label: 'Pause', icon: 'pause' as const, run: onPause }
      : run.status === 'paused'
        ? { label: 'Resume', icon: 'play' as const, run: onStart }
        : done
          ? { label: 'Start again', icon: 'play' as const, run: onStart }
          : { label: 'Start', icon: 'play' as const, run: onStart };

  const tvTitle = onTv
    ? 'Take off the TV'
    : tvTakenBy
      ? `Show on the TV instead of ${tvTakenBy}`
      : 'Show on the TV';

  return (
    <li
      className={`counter-row timer-row status-${run.status}${dragClass}`}
      tabIndex={-1}
      aria-label={name}
      data-testid="timer-row"
      data-timer-id={timer.id}
      {...dragProps}
    >
      <div className="counter-head">
        <span className="counter-name" title={name}>
          {name}
        </span>
        {confirming ? (
          <InlineConfirm
            name={name}
            onConfirm={() => {
              setConfirming(false);
              onDelete();
            }}
            onKeep={() => setConfirming(false)}
          />
        ) : (
          <span className="row-actions">
            <button
              type="button"
              className={`chrome-btn xs${timer.chime ? ' on' : ''}`}
              aria-label={timer.chime ? `Silence ${name} at zero` : `Chime when ${name} ends`}
              aria-pressed={timer.chime}
              title={timer.chime ? 'Chimes at zero' : 'Silent at zero'}
              onClick={onToggleChime}
            >
              <Icon name={timer.chime ? 'bell' : 'bellOff'} />
            </button>
            <button
              type="button"
              className={`chrome-btn xs${onTv ? ' on' : ''}`}
              aria-label={onTv ? `Take ${name} off the TV` : `Show ${name} on the TV`}
              aria-pressed={onTv}
              title={tvTitle}
              onClick={onToggleTv}
            >
              <Icon name="tv" />
            </button>
            <button
              type="button"
              className="chrome-btn xs"
              aria-label={`Reset ${name} to ${formatDurationLabel(timer.durationSec)}`}
              title={`Reset to ${formatClock(timer.durationSec * 1000)}`}
              disabled={run.status === 'idle'}
              onClick={onReset}
            >
              <Icon name="undo" />
            </button>
            <button
              type="button"
              className="chrome-btn xs"
              aria-label={`Edit ${name}`}
              title="Edit"
              onClick={onEdit}
            >
              <Icon name="pencil" />
            </button>
            <button
              type="button"
              className="chrome-btn xs danger"
              aria-label={`Delete ${name}`}
              title="Delete"
              onClick={() => setConfirming(true)}
            >
              <Icon name="trash" />
            </button>
          </span>
        )}
      </div>
      <div className="timer-controls">
        <span
          className="timer-clock"
          aria-label={`${name}: ${formatClock(left)} left`}
          data-testid="timer-clock"
        >
          {formatClock(left)}
        </span>
        {done && (
          <span className="badge timer-alert" role="status">
            Time&rsquo;s up
          </span>
        )}
        {run.status === 'paused' && <span className="muted small">Paused</span>}
        <button
          type="button"
          className="btn timer-main"
          aria-label={`${main.label} ${name}`}
          onClick={main.run}
        >
          <Icon name={main.icon} />
          {main.label}
        </button>
      </div>
    </li>
  );
}

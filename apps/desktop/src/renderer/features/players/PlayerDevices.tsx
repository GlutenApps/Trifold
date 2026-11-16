import { useEffect, useState } from 'react';
import type { ReclaimMode, TableStatus } from '@trifold/api';
import { useCampaignStore } from '../../stores/campaignStore';
import { tableOn, useTableStore } from '../../stores/tableStore';
import { Icon } from '../shell/icons';
import { MapPop } from '../presenter/MapPop';
import { JoinQr } from './JoinQr';

/** How long with nobody connected before the pop-up suggests the firewall or the Wi-Fi. */
const QUIET_MS = 60_000;

/**
 * The Player devices pop-up in the VTT tab's TV tools (ADR 0043; PLAYER-CONNECTOR.md, "What the DM
 * controls"): Let players join
 * and Stop, the join QR and addresses with Copy link, Show join code on TV (its one home), and
 * the devices with what each holds and Release. Not modal; usable mid-fight.
 */
export function PlayerDevicesPop({
  open,
  onToggle,
  onClose,
}: {
  open: boolean;
  onToggle(): void;
  onClose(): void;
}) {
  const status = useTableStore((s) => s.status);
  const campaignId = useCampaignStore((s) => s.current?.campaign.id);
  const on = tableOn(status, campaignId);
  const online = on ? (status?.devices.filter((d) => d.online).length ?? 0) : 0;
  return (
    <MapPop
      open={open}
      onClose={onClose}
      label="Player devices"
      side="down"
      trigger={
        <button
          type="button"
          className={`chrome-btn${open ? ' on' : ''}`}
          aria-label="Player devices"
          aria-haspopup="dialog"
          aria-expanded={open}
          title={
            on && status?.approvals.length
              ? 'Player devices: a player is waiting for you'
              : on
                ? `Player devices: players can join (${online} connected)`
                : 'Player devices: let players join from their phones'
          }
          onClick={onToggle}
        >
          <Icon name="phone" />
          {on && (status?.approvals.length ?? 0) > 0 ? (
            <span
              className="pip alert chrome-pip"
              data-testid="devices-waiting"
              aria-hidden="true"
            />
          ) : (
            on && <span className="pip tally chrome-pip" aria-hidden="true" />
          )}
        </button>
      }
    >
      <PlayerDevicesBody status={status} on={on} />
    </MapPop>
  );
}

function PlayerDevicesBody({ status, on }: { status: TableStatus | null; on: boolean }) {
  const {
    start,
    stop,
    release,
    joinOnTv,
    setJoinOnTv,
    error,
    setReclaimMode,
    answer,
    setMovementLock,
  } = useTableStore();
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on || status?.anyConnected) return;
    const t = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(t);
  }, [on, status?.anyConnected]);

  const starting = status?.state === 'starting';
  const url = status?.urls[0] ?? null;
  const quiet =
    on &&
    !status?.anyConnected &&
    !!status?.startedAt &&
    now - Date.parse(status.startedAt) > QUIET_MS;
  const holding = status?.devices.some((d) => d.claims.length) ?? false;

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(status?.localUrl ? `${status.localUrl}\n${url}` : url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="player-devices">
      <h3>Player devices</h3>
      {(error || status?.error) && (
        <p className="banner warn" role="alert">
          {error ?? status?.error}
        </p>
      )}
      {!on ? (
        <>
          <p className="muted">
            Players on this Wi-Fi open a page in their browser, pick their character and follow the
            map on their phone. Nothing leaves this network.
          </p>
          <p className="muted">
            The first time, your computer may ask whether Trifold can accept connections: allow it
            on private networks.
          </p>
          <button
            type="button"
            className="btn primary"
            disabled={starting}
            onClick={() => void start()}
          >
            {starting ? 'Starting…' : 'Let players join'}
          </button>
        </>
      ) : (
        <>
          {url && (
            <div className="join-code">
              <JoinQr url={url} size={148} />
              <div className="join-addresses">
                {status?.localUrl && <strong className="join-local">{status.localUrl}</strong>}
                <span className="join-ip">{url}</span>
                {status!.urls.slice(1).map((u) => (
                  <span key={u} className="join-ip muted">
                    {u}
                  </span>
                ))}
                <button type="button" className="btn" onClick={() => void copy()}>
                  {copied ? 'Copied' : 'Copy link'}
                </button>
              </div>
            </div>
          )}
          {quiet && (
            <p className="banner warn">
              No one has connected yet. The firewall may be blocking Trifold, or this Wi-Fi may keep
              devices apart (guest and school networks often do). A phone hotspot works.
            </p>
          )}
          <label className="field inline">
            <input
              type="checkbox"
              checked={joinOnTv}
              onChange={(e) => setJoinOnTv(e.target.checked)}
            />
            Show join code on TV
          </label>
          {status!.approvals.length > 0 && (
            <ul className="device-list approvals" aria-label="Waiting for you">
              {status!.approvals.map((a) => (
                <li key={a.requestId} className="approval-row">
                  <span className="grow">
                    {a.summon
                      ? `${a.label} wants to summon ${a.summon.count > 1 ? `${a.summon.count} × ` : ''}${a.summon.name} for ${a.creatureName}`
                      : a.takeover
                        ? `${a.label} wants to take over ${a.creatureName}`
                        : `${a.label} asks for ${a.creatureName}`}
                  </span>
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => void answer(a.requestId, true)}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => void answer(a.requestId, false)}
                  >
                    Deny
                  </button>
                </li>
              ))}
            </ul>
          )}
          <label className="field inline">
            <input
              type="checkbox"
              checked={status!.movement.all}
              onChange={(e) => void setMovementLock('all', e.target.checked)}
            />
            Lock movement
          </label>
          <DeviceList
            status={status!}
            onRelease={(kind, id) => void release({ kind, id })}
            onLock={(kind, id, locked) => void setMovementLock({ kind, id }, locked)}
          />
          <label className="field inline reclaim-mode">
            Getting a character back
            <select
              value={status!.reclaimMode}
              onChange={(e) => void setReclaimMode(e.target.value as ReclaimMode)}
            >
              <option value="open">Open: just tap it</option>
              <option value="pin">PIN: set at the first pick</option>
              <option value="approval">Ask me first</option>
            </select>
          </label>
          <SummoningSettings status={status!} />
          <div className="row player-devices-actions">
            <button
              type="button"
              className="btn"
              disabled={!holding}
              onClick={() => void release('all')}
            >
              Release all
            </button>
            <span className="grow" />
            <button type="button" className="btn" onClick={() => void stop()}>
              Stop
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function DeviceList({
  status,
  onRelease,
  onLock,
}: {
  status: TableStatus;
  onRelease(kind: 'pc' | 'npc', id: string): void;
  onLock(kind: 'pc' | 'npc', id: string, locked: boolean): void;
}) {
  if (!status.devices.length) {
    return (
      <p className="muted">
        {status.connections
          ? `${status.connections} connected, picking a character.`
          : 'No devices yet.'}
      </p>
    );
  }
  return (
    <ul className="device-list" aria-label="Devices">
      {status.devices.map((d) => (
        <li key={d.deviceId} className="device-row">
          <span className="device-head">
            <span
              className={`device-dot${d.online ? ' online' : ''}`}
              aria-label={d.online ? 'online' : 'offline'}
            />
            <span className="device-name">{d.label || 'Unnamed device'}</span>
            <span className="muted">{d.online ? 'online' : 'offline'}</span>
          </span>
          <ul className="device-claims">
            {d.claims.map((c) => (
              <li key={`${c.kind}:${c.id}`} className="device-claim">
                <span className="grow">{c.name}</span>
                {(() => {
                  const locked = status.movement.creatures.includes(`${c.kind}:${c.id}`);
                  return (
                    <button
                      type="button"
                      className={`chrome-btn xs${locked ? ' on' : ''}`}
                      aria-label={`Lock ${c.name}'s movement`}
                      aria-pressed={locked}
                      title={
                        locked
                          ? `${c.name} can't be moved from the phone. Click to unlock`
                          : `Stop ${c.name} being moved from the phone`
                      }
                      onClick={() => onLock(c.kind, c.id, !locked)}
                    >
                      <Icon name={locked ? 'lock' : 'unlock'} />
                    </button>
                  );
                })()}
                <button
                  type="button"
                  className="chrome-btn xs"
                  aria-label={`Release ${c.name}`}
                  title={`Release ${c.name}: back to DM control, nothing else changes`}
                  onClick={() => onRelease(c.kind, c.id)}
                >
                  <Icon name="linkOff" />
                </button>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

/**
 * Player summoning (ADR 0043): on, ask me first, or off; how many summons a character
 * may have in play; and how many creatures are on the summon list, which lives in
 * Campaign › Summons (and the paw on a compendium page).
 */
const NO_SUMMONS: never[] = [];
function SummoningSettings({ status }: { status: TableStatus }) {
  const setSummoning = useTableStore((s) => s.setSummoning);
  const list = useCampaignStore((s) => s.current?.campaign.settings.summonable ?? NO_SUMMONS);
  const { mode, cap } = status.summoning;
  return (
    <div className="summoning-settings">
      <div className="row">
        <label className="field inline">
          Player summoning
          <select
            value={mode}
            onChange={(e) =>
              void setSummoning({ mode: e.target.value as 'on' | 'approval' | 'off', cap })
            }
          >
            <option value="on">On</option>
            <option value="approval">Ask me first</option>
            <option value="off">Off</option>
          </select>
        </label>
        <label className="field inline">
          Most per character
          <input
            type="number"
            className="narrow"
            min={1}
            max={20}
            value={cap}
            onChange={(e) => {
              const n = Math.max(1, Math.min(20, Number(e.target.value) || 1));
              void setSummoning({ mode, cap: n });
            }}
          />
        </label>
      </div>
      <p className="muted">
        {list.length
          ? `${list.length} ${list.length === 1 ? 'creature' : 'creatures'} on the companion list. Change it in Campaign › Companions.`
          : 'No companions yet: add them in Campaign › Companions, or press Available as a companion on a creature’s compendium page.'}
      </p>
    </div>
  );
}

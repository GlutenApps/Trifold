import { useState } from 'react';
import { useCampaignStore } from '../../stores/campaignStore';
import { tableOn, useTableStore } from '../../stores/tableStore';
import { MapPop } from '../presenter/MapPop';
import { Icon } from '../shell/icons';

/**
 * Give to… (ADR 0043, Phase 3): the DM hands a PC card or NPC to a phone connected now. It moves
 * the claim from any device that held it, skips the reclaim mode and the player-controllable flag
 * (the DM's call), and takes a PC's companions along. Shown only while players are connected.
 * `variant` picks the control's tier: an icon in the map's token actions, a text button on a form.
 */
export function GiveTo({
  kind,
  id,
  name,
  variant,
}: {
  kind: 'pc' | 'npc';
  id: string;
  name: string;
  variant: 'icon' | 'button';
}) {
  const [open, setOpen] = useState(false);
  const status = useTableStore((s) => s.status);
  const give = useTableStore((s) => s.give);
  const campaignId = useCampaignStore((s) => s.current?.campaign.id);
  const devices = tableOn(status, campaignId) ? status!.devices.filter((d) => d.online) : [];
  if (!id || !devices.length) return null;
  const holder = status!.devices.find((d) => d.claims.some((c) => c.kind === kind && c.id === id));
  const label = `Give ${name} to a player`;
  return (
    <MapPop
      open={open}
      onClose={() => setOpen(false)}
      label={label}
      side="down"
      trigger={
        variant === 'icon' ? (
          <button
            type="button"
            className={`chrome-btn${open ? ' on' : ''}`}
            aria-label={label}
            aria-haspopup="dialog"
            aria-expanded={open}
            title={`Give ${name} to a player’s phone`}
            onClick={() => setOpen((o) => !o)}
          >
            <Icon name="send" />
          </button>
        ) : (
          <button
            type="button"
            className="btn"
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            Give to…
          </button>
        )
      }
    >
      <h3>Give {name} to</h3>
      <ul className="device-list" aria-label="Devices online">
        {devices.map((d) => (
          <li key={d.deviceId}>
            <button
              type="button"
              className="btn"
              disabled={holder?.deviceId === d.deviceId}
              onClick={() => {
                void give({ kind, id }, d.deviceId);
                setOpen(false);
              }}
            >
              {d.label || 'Unnamed device'}
              {holder?.deviceId === d.deviceId ? ' (has it)' : ''}
            </button>
          </li>
        ))}
      </ul>
    </MapPop>
  );
}

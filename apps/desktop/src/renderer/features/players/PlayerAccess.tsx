import { useTableStore } from '../../stores/tableStore';
import { Check } from '../compendium/editorParts';

/**
 * The player connector on a PC card or NPC form (ADR 0043): whether players can claim the
 * character, and, when a device holds it, which one, with Release. Releasing never changes the
 * character; it goes back to the DM. The flag saves with the form; Release acts at once.
 */
export function PlayerAccess({
  kind,
  id,
  checked,
  onChange,
}: {
  kind: 'pc' | 'npc';
  id: string;
  checked: boolean;
  onChange(checked: boolean): void;
}) {
  const status = useTableStore((s) => s.status);
  const release = useTableStore((s) => s.release);
  const holder = id
    ? status?.devices.find((d) => d.claims.some((c) => c.kind === kind && c.id === id))
    : undefined;
  return (
    <div className="span-all player-access">
      <Check label="Players can claim this character" checked={checked} onChange={onChange} />
      {holder && (
        <p className="row player-access-claim">
          <span className="muted">
            {`Claimed by ${holder.label || 'an unnamed device'} (${holder.online ? 'online' : 'offline'})`}
          </span>
          <button type="button" className="btn" onClick={() => void release({ kind, id })}>
            Release
          </button>
        </p>
      )}
    </div>
  );
}

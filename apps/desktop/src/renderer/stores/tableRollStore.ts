import { create } from 'zustand';
import type { TableRoll } from '@trifold/api';
import { useRollLogStore } from './rollLogStore';

/**
 * Table rolls (docs/PLAYER-MODE.md, "Table rolls"; ADR 0059). In a player console a roll from
 * the Dice pop-up or the strip's pool is either **Table**, asked of the GM's Trifold, which
 * makes it and shows it in every roll log at the table, or **Private**, made here and sent
 * nowhere. `send` is how a Table roll is asked for: the player console sets it while the player
 * is at the table holding a character, and it is null otherwise, when every roll is private
 * whatever the switch says. The GM's console never sets it: a GM's rolls are their own.
 */
export type TableRollMode = 'table' | 'private';

interface TableRollState {
  /** The player's choice; Table until they say otherwise. Session only. */
  mode: TableRollMode;
  send: ((expression: string) => void) | null;
  setMode(mode: TableRollMode): void;
  setSend(send: ((expression: string) => void) | null): void;
}

export const useTableRollStore = create<TableRollState>((set) => ({
  mode: 'table',
  send: null,
  setMode: (mode) => set({ mode }),
  setSend: (send) => set({ send }),
}));

/** Where the next roll goes: to the table when the player chose that and can, else nowhere. */
export function tableRollSender(): ((expression: string) => void) | null {
  const { mode, send } = useTableRollStore.getState();
  return mode === 'table' ? send : null;
}

/** A roll made at the table, into this console's roll log, named for who rolled. */
export function logTableRoll(roll: TableRoll): void {
  useRollLogStore.getState().add({
    kind: 'dice',
    label: roll.label,
    expression: roll.expression,
    total: roll.total,
    faces: roll.faces,
    source: 'table',
    actor: roll.by,
    ...(roll.outcome ? { outcome: roll.outcome } : {}),
  });
}

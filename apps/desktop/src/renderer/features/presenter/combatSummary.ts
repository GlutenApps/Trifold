import type { CombatSummary } from '@trifold/api';
import type { CombatState } from '@trifold/schema';
import { playerLabels } from '@trifold/rules';

/**
 * What the TV may know about the fight (DESIGN.md §6.4 "Player-facing display"): masked names
 * until revealed, no hidden combatants, no exact creature HP, optional bloodied marker and PC
 * health bars.
 */
export function summarizeCombat(
  state: CombatState | null,
  options: { pcHealthBars: boolean; hpDisplayMode: 'hidden' | 'bloodied' | 'exact' },
): CombatSummary | null {
  if (!state) return null;
  const active = state.turnIndex >= 0 ? (state.combatants[state.turnIndex]?.id ?? null) : null;
  const shown = state.combatants.filter((c) => !c.hidden && !c.isLair);
  // Numbered like the DM's names, so Goblin 3's chip and token read the same (Humanoid 3).
  const names = playerLabels(
    shown.map((c) => ({
      id: c.id,
      name: c.name,
      shown: c.ref.kind === 'pc' || c.revealed ? c.name : c.maskedName,
    })),
  );
  return {
    round: state.round,
    activeId: active,
    entries: shown.map((c) => {
      const isPc = c.ref.kind === 'pc';
      const fraction = c.hp.max > 0 ? Math.max(0, Math.min(1, c.hp.current / c.hp.max)) : 0;
      return {
        id: c.id,
        name: names.get(c.id) ?? c.name,
        role: c.role,
        isPc,
        dead: c.dead,
        ...(c.tokenId ? { tokenId: c.tokenId } : {}),
        ...(isPc && options.pcHealthBars ? { hpFraction: fraction } : {}),
        bloodied:
          !isPc &&
          !c.dead &&
          options.hpDisplayMode !== 'hidden' &&
          c.hp.max > 0 &&
          c.hp.current <= c.hp.max / 2,
      };
    }),
  };
}

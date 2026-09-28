import type { CombatSummary } from '@trifold/api';
import type { CombatState } from '@trifold/schema';

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
  return {
    round: state.round,
    activeId: active,
    entries: state.combatants
      .filter((c) => !c.hidden && !c.isLair)
      .map((c) => {
        const isPc = c.ref.kind === 'pc';
        const fraction = c.hp.max > 0 ? Math.max(0, Math.min(1, c.hp.current / c.hp.max)) : 0;
        return {
          id: c.id,
          name: isPc || c.revealed ? c.name : c.maskedName,
          role: c.role,
          isPc,
          dead: c.dead,
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

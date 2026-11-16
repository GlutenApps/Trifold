import { playerLabels } from '@trifold/rules';
import type { Token } from '@trifold/schema';

/**
 * What players read under each token on the TV and the phones: the label, or its mask with the
 * label's number (Goblin 3 → Humanoid 3), so a numbered creature can be told apart and matched
 * to its chip in the initiative strip. Worked out over every token on the scene, so the TV and
 * the phones number them alike.
 */
export function tokenPlayerLabels(tokens: readonly Token[]): Map<string, string> {
  return playerLabels(
    tokens.map((t) => ({
      id: t.id,
      name: t.label,
      shown: t.kind === 'creature' && t.nameMasked ? (t.maskedLabel ?? 'Creature') : t.label,
    })),
  );
}

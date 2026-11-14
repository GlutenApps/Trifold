import { CR_ORDER, difficultyBand, partyBudget } from '@trifold/rules';
import type { CombatantTemplate } from '@trifold/schema';
import { Icon } from '../shell/icons';
import { canQuickScale, crOf, enemyXp, stepAll, xpOf, type PendingCrs } from './quickScale';

/**
 * The encounter's difficulty at the top of the builder (DESIGN.md §6.4, ADR 0038 §7): one row
 * with the 2024 band, the enemies' XP against the party's budget and a meter, and Scale, which
 * opens a list of every compendium creature in the encounter with a CR picker beside it. The
 * band and the meter follow the picks as they change; Apply writes them.
 */
const BAND_LABEL = { trivial: 'Trivial', low: 'Low', moderate: 'Moderate', high: 'High' } as const;

const fmt = (n: number) => n.toLocaleString();

export function DifficultyBar({
  templates,
  partyLevels,
  pending,
  scaling,
  busy,
  error,
  onToggleScale,
  onPick,
  onApply,
  onCancel,
}: {
  templates: readonly CombatantTemplate[];
  partyLevels: readonly number[];
  pending: PendingCrs;
  scaling: boolean;
  busy: boolean;
  error: string | null;
  onToggleScale(): void;
  onPick(next: Record<string, string>): void;
  onApply(): void;
  onCancel(): void;
}) {
  const budget = partyBudget([...partyLevels]);
  const xp = enemyXp(templates, pending);
  const band = partyLevels.length ? difficultyBand(xp, budget) : null;
  const scalable = templates.filter(canQuickScale);
  const changes = scalable.filter(
    (t) => pending[t.id] !== undefined && pending[t.id] !== t.cache?.cr,
  ).length;
  // The meter runs to a quarter past High, so an encounter over budget still shows how far.
  const top = budget.high * 1.25 || 1;
  const pct = (n: number) => `${Math.min(100, (n / top) * 100)}%`;

  return (
    <div className={`difficulty-wrap${scaling ? ' open' : ''}`}>
      <div className={`difficulty-bar band-${band ?? 'none'}`} data-testid="difficulty">
        {band ? (
          <>
            <span className="difficulty-band" data-testid="difficulty-band">
              {BAND_LABEL[band]}
            </span>
            <span className="difficulty-xp">
              <strong>{fmt(xp)} XP</strong>
              <span className="muted"> · {fmt(Math.round(xp / partyLevels.length))} per PC</span>
            </span>
            <span
              className="difficulty-meter"
              role="img"
              aria-label={`${fmt(xp)} XP against a budget of low ${fmt(budget.low)}, moderate ${fmt(budget.moderate)}, high ${fmt(budget.high)}`}
              title={`2024 budget for this party: low ${fmt(budget.low)} · moderate ${fmt(budget.moderate)} · high ${fmt(budget.high)}`}
            >
              <span className="difficulty-fill" style={{ width: pct(xp) }} />
              {(['low', 'moderate', 'high'] as const).map((b) => (
                <span key={b} className="difficulty-tick" style={{ left: pct(budget[b]) }} />
              ))}
            </span>
          </>
        ) : (
          <span className="muted">
            Add PCs to see how hard this is for them · Enemy XP {fmt(xp)}
          </span>
        )}
        <span className="spacer" />
        <button
          type="button"
          className={`btn${scaling ? ' on' : ''}`}
          aria-expanded={scaling}
          disabled={scalable.length === 0}
          title={
            scalable.length
              ? 'Pick a new CR for each creature and watch the difficulty change'
              : 'Add a creature from the compendium to scale it'
          }
          onClick={onToggleScale}
        >
          <Icon name="sliders" />
          Scale
        </button>
      </div>

      {scaling && (
        <div className="quick-scale" role="group" aria-label="Scale the creatures">
          <div className="quick-scale-head">
            <span className="muted small">
              Each creature keeps its name; its stat block moves to the new CR (Scaled tag) and is
              kept in this campaign.
            </span>
            <span className="spacer" />
            <span className="muted small" aria-hidden="true">
              All
            </span>
            <span className="icon-toolbar" role="group" aria-label="Every creature">
              <button
                type="button"
                className="chrome-btn"
                aria-label="Every creature one CR lower"
                title="Every creature one CR lower"
                onClick={() => onPick(stepAll(templates, pending, -1))}
              >
                <Icon name="minus" />
              </button>
              <button
                type="button"
                className="chrome-btn"
                aria-label="Every creature one CR higher"
                title="Every creature one CR higher"
                onClick={() => onPick(stepAll(templates, pending, 1))}
              >
                <Icon name="plus" />
              </button>
            </span>
          </div>
          <ul className="quick-scale-list">
            {scalable.map((t) => {
              const name = t.label || t.ref.name;
              const cr = crOf(t, pending);
              const changed = cr !== t.cache?.cr;
              return (
                <li key={t.id} className={changed ? 'changed' : undefined}>
                  <span className="quick-scale-name">
                    <strong>{name}</strong>
                    {t.quantity > 1 && <span className="muted"> ×{t.quantity}</span>}
                    {t.role !== 'enemy' && <span className="badge">{t.role}</span>}
                  </span>
                  <span className="muted small quick-scale-from">
                    {changed ? `CR ${t.cache?.cr} →` : 'CR'}
                  </span>
                  <select
                    aria-label={`New CR for ${name}`}
                    value={cr}
                    onChange={(e) => onPick({ ...pending, [t.id]: e.target.value })}
                  >
                    {CR_ORDER.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <span className="muted small quick-scale-xp">
                    {fmt(xpOf(t, pending) * t.quantity)} XP
                  </span>
                </li>
              );
            })}
          </ul>
          {templates.some((t) => t.ref.kind === 'npc') && (
            <p className="muted small">
              Named NPCs are not listed: scale one from its stat block (Edit), since it is the same
              NPC everywhere.
            </p>
          )}
          {error && (
            <div className="banner error" role="alert">
              <span>{error}</span>
            </div>
          )}
          <div className="books-panel-foot">
            <button type="button" className="btn" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={changes === 0 || busy}
              onClick={onApply}
            >
              {busy
                ? 'Scaling…'
                : changes
                  ? `Apply ${changes} ${changes === 1 ? 'change' : 'changes'}`
                  : 'Apply'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

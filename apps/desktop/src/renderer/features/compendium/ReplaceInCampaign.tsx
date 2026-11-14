import { useEffect, useState } from 'react';
import type { CompendiumRecord } from '@trifold/schema';
import { describePlan, planReplace, replaceInCampaign } from '../encounters/replaceReferences';
import { recordTarget } from '../encounters/saveToCompendium';
import type { RecordIdentity } from '../encounters/templates';
import { useCampaignStore } from '../../stores/campaignStore';
import { useCombatStore } from '../../stores/combatStore';
import { InlineConfirm } from '../shell/InlineConfirm';

/**
 * Replace references on a homebrew monster's page (DESIGN.md §6.2, Beta 4): use this copy in
 * place of its original across the open campaign, or put the original back. Each shows what it
 * would change before anything is written; the counts come from the campaign as it is now.
 */

const identity = (r: CompendiumRecord): RecordIdentity => ({
  id: r.id,
  sourceId: r.sourceId,
  key: r.key,
});

export function ReplaceInCampaign({ record }: { record: CompendiumRecord }) {
  const current = useCampaignStore((s) => s.current);
  const fightId = useCombatStore((s) => s.encounterId);
  const fight = useCombatStore((s) => s.state);
  const basedOn = record.basedOn;
  // undefined while loading; null when the original is no longer in the compendium.
  const [original, setOriginal] = useState<CompendiumRecord | null | undefined>(undefined);
  const [confirm, setConfirm] = useState<'replace' | 'restore' | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    setConfirm(null);
    setDone(null);
    if (!basedOn) return;
    let live = true;
    setOriginal(undefined);
    void window.trifold.compendium
      .get(basedOn.recordId)
      .catch(() => null)
      .then((found) => {
        if (live) setOriginal(found);
      });
    return () => {
      live = false;
    };
  }, [basedOn, record.id]);

  if (record.kind !== 'monster' || !basedOn || !current || original === undefined) return null;

  const live = fightId && fight ? { encounterId: fightId, combatants: fight.combatants } : null;
  // Without the original record its key is unknown, so only its id can be matched.
  const from: RecordIdentity = original
    ? identity(original)
    : { id: basedOn.recordId, sourceId: basedOn.sourceId, key: '' };
  const originalName = original?.displayName ?? 'the original';
  const forward = planReplace(current, from, recordTarget(record), live);
  const back = original
    ? planReplace(current, identity(record), recordTarget(original), live)
    : null;
  const forwardWhat = describePlan(forward);
  const backWhat = back ? describePlan(back) : '';
  const campaign = current.campaign.name;

  const run = async (kind: 'replace' | 'restore') => {
    setConfirm(null);
    setBusy(true);
    const plan =
      kind === 'replace'
        ? await replaceInCampaign(from, recordTarget(record))
        : original
          ? await replaceInCampaign(identity(record), recordTarget(original))
          : null;
    setBusy(false);
    if (!plan) return;
    const what = describePlan(plan);
    setDone(
      kind === 'replace'
        ? `${record.displayName} now stands in for ${originalName} in ${what}.`
        : `${originalName} is back in ${what}.`,
    );
  };

  return (
    <section className="replace-in-campaign" aria-label="Replace references">
      <h3>In {campaign}</h3>
      {!forwardWhat && !backWhat && (
        <p className="muted small">
          {campaign} does not use {originalName} or {record.displayName} in any encounter or map.
        </p>
      )}
      {forwardWhat && (
        <div className="row">
          {confirm === 'replace' ? (
            <InlineConfirm
              name={originalName}
              verb="Replace"
              question={`Use ${record.displayName} in place of ${originalName} in ${forwardWhat}? Labels and HP overrides stay.`}
              onConfirm={() => void run('replace')}
              onKeep={() => setConfirm(null)}
            />
          ) : (
            <button
              type="button"
              className="btn"
              disabled={busy}
              title={`${campaign} uses ${originalName} in ${forwardWhat}`}
              onClick={() => setConfirm('replace')}
            >
              Replace {originalName} in this campaign…
            </button>
          )}
        </div>
      )}
      {backWhat && (
        <div className="row">
          {confirm === 'restore' ? (
            <InlineConfirm
              name={originalName}
              verb="Put back"
              question={`Put ${originalName} back in place of ${record.displayName} in ${backWhat}?`}
              onConfirm={() => void run('restore')}
              onKeep={() => setConfirm(null)}
            />
          ) : (
            <button
              type="button"
              className="btn"
              disabled={busy}
              title={`${campaign} uses ${record.displayName} in ${backWhat}`}
              onClick={() => setConfirm('restore')}
            >
              Put {originalName} back in this campaign…
            </button>
          )}
        </div>
      )}
      {done && (
        <p className="muted small" role="status">
          {done}
        </p>
      )}
    </section>
  );
}

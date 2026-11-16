import { useEffect, useState } from 'react';
import { ulid } from 'ulid';
import type { CompendiumSuggestion } from '@trifold/api';
import { normalizeKey } from '@trifold/rules';
import type { MonsterRecord, SummonableEntry } from '@trifold/schema';
import { errorMessage } from '@trifold/schema';
import { useCampaignStore } from '../../stores/campaignStore';
import { blankRecord } from '../compendium/homebrew';
import { MonsterEditor } from '../compendium/MonsterEditor';
import { Icon } from '../shell/icons';
import { summonableEntry } from './SummonableToggle';

/**
 * Campaign › Summons (ADR 0043): the creatures players may summon from their phones in
 * this campaign. Add one from the compendium, make a new one (a spiritual weapon, a homebrew
 * familiar), or customise one: editing a stock creature makes this campaign's own copy and the
 * list points at it, so the compendium's original never changes. The paw on a compendium page
 * adds to the same list.
 */
type View =
  | { kind: 'list' }
  | { kind: 'edit'; record: MonsterRecord; isNew: boolean; replaces: string | null };

export function SummonsTab() {
  const campaign = useCampaignStore((s) => s.current?.campaign);
  const update = useCampaignStore((s) => s.update);
  const [view, setView] = useState<View>({ kind: 'list' });
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CompendiumSuggestion[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) {
      setResults([]);
      return;
    }
    let stale = false;
    const t = window.setTimeout(() => {
      void window.trifold.compendium
        .suggest(text, { limit: 20 })
        .then((rows) => {
          if (!stale) setResults(rows.filter((r) => r.kind === 'monster'));
        })
        .catch(() => undefined);
    }, 150);
    return () => {
      stale = true;
      window.clearTimeout(t);
    };
  }, [query]);

  // Creatures edited elsewhere (the compendium's editor) keep their cached stats here in step.
  const campaignId = campaign?.id;
  useEffect(() => {
    const current = useCampaignStore.getState().current?.campaign;
    if (!current || !current.settings.summonable.length) return;
    let stale = false;
    void Promise.all(
      current.settings.summonable.map(async (e) => {
        const record = await window.trifold.compendium.get(e.ref.recordId).catch(() => null);
        return record?.kind === 'monster' ? summonableEntry(record) : e;
      }),
    ).then((fresh) => {
      if (stale) return;
      const now = useCampaignStore.getState().current?.campaign;
      if (!now || JSON.stringify(fresh) === JSON.stringify(now.settings.summonable)) return;
      void update({ settings: { ...now.settings, summonable: fresh } });
    });
    return () => {
      stale = true;
    };
  }, [campaignId, update]);

  if (!campaign) return null;
  const list = campaign.settings.summonable;
  const setList = (summonable: SummonableEntry[]) =>
    update({ settings: { ...campaign.settings, summonable } });
  const listed = new Set(list.map((e) => e.ref.recordId));

  const run = async (task: () => Promise<void>) => {
    setError(null);
    try {
      await task();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const add = (row: CompendiumSuggestion) =>
    run(async () => {
      const record = await window.trifold.compendium.get(row.id);
      if (record?.kind !== 'monster') throw new Error('That is not a creature.');
      await setList([...list, summonableEntry(record)]);
    });

  const edit = (entry: SummonableEntry) =>
    run(async () => {
      // This campaign's own creature is edited in place; a stock one becomes a campaign copy.
      const own = entry.ref.sourceId.startsWith('campaign:');
      const record = own
        ? await window.trifold.compendium.get(entry.ref.recordId)
        : await window.trifold.homebrew.draft(entry.ref.recordId, 'campaign');
      if (record?.kind !== 'monster')
        throw new Error('That creature is no longer in the compendium.');
      setView({ kind: 'edit', record, isNew: false, replaces: own ? null : entry.ref.recordId });
    });

  const startNew = () => {
    const blank = blankRecord('monster') as MonsterRecord;
    setView({
      kind: 'edit',
      isNew: true,
      replaces: null,
      record: {
        ...blank,
        id: `creature:monster:${ulid()}`,
        sourceId: `campaign:${campaign.slug}`,
        sourceBook: campaign.name,
      },
    });
  };

  if (view.kind === 'edit') {
    return (
      <div className="summons-edit">
        {error && (
          <p className="banner error" role="alert">
            {error}
          </p>
        )}
        <MonsterEditor
          record={view.record}
          isNew={view.isNew}
          saving={saving}
          onCancel={() => setView({ kind: 'list' })}
          onSave={(record) =>
            void (async () => {
              setSaving(true);
              setError(null);
              try {
                const saved = await window.trifold.homebrew.save({
                  ...record,
                  key: record.key || normalizeKey(record.displayName || record.name),
                });
                if (saved.kind !== 'monster') throw new Error('Could not save that creature.');
                const entry = summonableEntry(saved);
                // The list keeps its order: an edited creature takes its own (or its original's) place.
                const at = list.findIndex(
                  (e) => e.ref.recordId === saved.id || e.ref.recordId === view.replaces,
                );
                await setList(
                  at === -1 ? [...list, entry] : list.map((e, i) => (i === at ? entry : e)),
                );
                setView({ kind: 'list' });
              } catch (err) {
                setError(errorMessage(err));
              } finally {
                setSaving(false);
              }
            })()
          }
        />
      </div>
    );
  }

  return (
    <div className="summons-tab">
      {error && (
        <p className="banner error" role="alert">
          {error}
        </p>
      )}
      <p className="muted">
        Companions players can bring into play from their phones in this campaign: summoned
        creatures, familiars, steeds and beasts. Editing a compendium creature makes this campaign’s
        own copy; the original stays as it is.
      </p>
      <div className="row">
        <input
          type="search"
          className="grow"
          aria-label="Add a companion from the compendium"
          placeholder="Search the compendium to add a companion"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="button" className="btn" onClick={startNew}>
          <Icon name="plus" />
          New companion
        </button>
      </div>
      {results.length > 0 && (
        <ul className="summon-results" aria-label="Compendium creatures">
          {results.map((r) => (
            <li key={r.id} className="summon-row">
              <span className="grow">
                {r.displayName}
                <span className="muted">
                  {' '}
                  · {r.type ?? 'creature'} · {r.sourceName}
                </span>
              </span>
              <button
                type="button"
                className="btn"
                disabled={listed.has(r.id)}
                onClick={() => {
                  void add(r);
                  setQuery('');
                }}
              >
                {listed.has(r.id) ? 'On the list' : 'Add'}
              </button>
            </li>
          ))}
        </ul>
      )}
      {list.length === 0 ? (
        <p className="muted">
          No companions yet. Search above, make a new one, or press Available as a companion on a
          creature’s compendium page.
        </p>
      ) : (
        <>
          <h3 className="summon-heading">On the companion list</h3>
          <ul className="summon-list" aria-label="Companions">
            {list.map((e) => (
              <li key={e.ref.recordId} className="summon-row">
                <span className="grow">
                  <strong>{e.name}</strong>
                  <span className="muted">
                    {' '}
                    · {e.type || 'creature'} · AC {e.ac ?? '—'} · HP {e.hp ?? '—'}
                    {e.ref.sourceId.startsWith('campaign:') ? ' · this campaign' : ''}
                  </span>
                </span>
                <button
                  type="button"
                  className="chrome-btn xs"
                  aria-label={`Edit ${e.name}`}
                  title={
                    e.ref.sourceId.startsWith('campaign:')
                      ? `Edit ${e.name}`
                      : `Customise ${e.name}: this campaign gets its own copy`
                  }
                  onClick={() => void edit(e)}
                >
                  <Icon name="pencil" />
                </button>
                <button
                  type="button"
                  className="chrome-btn xs"
                  aria-label={`Take ${e.name} off the companion list`}
                  title={`Take ${e.name} off the companion list; the creature stays in the compendium`}
                  onClick={() =>
                    void setList(list.filter((x) => x.ref.recordId !== e.ref.recordId))
                  }
                >
                  <Icon name="close" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

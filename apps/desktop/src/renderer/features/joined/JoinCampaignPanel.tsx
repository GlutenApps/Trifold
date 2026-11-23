import { useEffect, useState } from 'react';
import type { FoundTableSummary, PlayerPackInfo } from '@trifold/api';
import { useJoinedStore } from '../../stores/joinedStore';

/**
 * Join a campaign (docs/PLAYER-MODE.md, "Joining"): the tables on the local network, each with
 * a Join button, and under them a field for the address a GM shows, for networks that block the
 * search. Choosing a table asks for the name the GM will see, then joins.
 *
 * The search runs only while this panel is open: it starts when the panel mounts and stops when
 * it closes (CLAUDE.md ground rule 1).
 */

/** How long the search runs before the panel says it found nothing and points at the address. */
const QUIET_MS = 4000;

export function JoinCampaignPanel({ onClose }: { onClose: () => void }) {
  const tables = useJoinedStore((s) => s.tables);
  const joined = useJoinedStore((s) => s.joined);
  const startSearch = useJoinedStore((s) => s.startSearch);
  const stopSearch = useJoinedStore((s) => s.stopSearch);
  const peek = useJoinedStore((s) => s.peek);
  const join = useJoinedStore((s) => s.join);
  const [quiet, setQuiet] = useState(false);
  const [byAddress, setByAddress] = useState(false);
  const [address, setAddress] = useState('');
  const [asking, setAsking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  /** The table being joined: the name step. */
  const [chosen, setChosen] = useState<FoundTableSummary | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  /** A player pack chosen from a file (ADR 0064): the name step for it. */
  const [pack, setPack] = useState<PlayerPackInfo | null>(null);
  const openPack = useJoinedStore((s) => s.openPack);

  useEffect(() => {
    void startSearch();
    const timer = window.setTimeout(() => setQuiet(true), QUIET_MS);
    return () => {
      window.clearTimeout(timer);
      void stopSearch();
    };
  }, [startSearch, stopSearch]);

  const choose = (table: FoundTableSummary) => {
    // The name last used, so a player types theirs once.
    setName(
      joined.find((j) => j.campaignId === table.campaignId)?.displayName ??
        joined[0]?.displayName ??
        '',
    );
    setChosen(table);
  };

  const find = async () => {
    setProblem(null);
    setAsking(true);
    const answer = await peek(address);
    setAsking(false);
    if (answer.ok) choose(answer.table);
    else {
      setProblem(
        answer.reason === 'address'
          ? 'That is not an address on your local network. Use the one your GM’s Trifold shows.'
          : 'Nothing answered at that address. Check that your GM has let players join and that you are on the same network.',
      );
    }
  };

  const choosePack = async () => {
    setProblem(null);
    try {
      const info = await window.trifold.joined.choosePack();
      if (!info) return;
      setName(
        joined.find((j) => j.campaignId === info.campaignId)?.displayName ??
          joined[0]?.displayName ??
          '',
      );
      setPack(info);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : String(err));
    }
  };

  if (pack) {
    const title = pack.campaignName || 'this campaign';
    return (
      <form
        className="card campaign-create"
        data-testid="join-campaign"
        onKeyDown={(e) => {
          if (e.key === 'Escape') setPack(null);
        }}
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setProblem(null);
          void openPack(pack.path, name).then((failed) => {
            setBusy(false);
            if (failed) setProblem(failed);
            else onClose();
          });
        }}
      >
        <div className="campaign-create-way" data-testid="join-from-pack">
          <strong>
            {pack.joined ? `Update ${title} from a file` : `Join ${title} from a file`}
          </strong>
          <p className="muted small">
            {pack.records > 0
              ? `${pack.records.toLocaleString()} ${pack.records === 1 ? 'record' : 'records'} your GM shares, from ${new Date(pack.createdAt).toLocaleDateString()}.`
              : 'Your GM shares nothing in this file yet; it adds the campaign to your Playing list.'}{' '}
            You connect to the table at your first session.
          </p>
          {pack.sourcesNotIncluded.length > 0 && (
            <p className="muted small" data-testid="pack-not-included">
              Not in the file: {pack.sourcesNotIncluded.join(', ')}. If you own one, import it in
              your Library.
            </p>
          )}
          {pack.older && (
            <p className="small join-problem" role="alert">
              You already have newer content from your GM for this campaign, so this file would not
              be used.
            </p>
          )}
          {!pack.joined && (
            <>
              <p className="muted small">Your GM sees this name beside the character you pick.</p>
              <input
                type="text"
                aria-label="Your name at the table"
                placeholder="Your name"
                className="wide-input"
                maxLength={40}
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </>
          )}
          {problem && (
            <p className="small join-problem" role="alert">
              {problem}
            </p>
          )}
          <div className="row">
            <button type="submit" className="btn primary" disabled={busy || pack.older}>
              {pack.joined ? 'Update' : 'Join'}
            </button>
            <button type="button" className="btn" onClick={() => setPack(null)}>
              Back
            </button>
          </div>
        </div>
      </form>
    );
  }

  if (chosen) {
    return (
      <form
        className="card campaign-create"
        data-testid="join-campaign"
        onKeyDown={(e) => {
          if (e.key === 'Escape') setChosen(null);
        }}
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          void join(chosen, name).then((ok) => {
            setBusy(false);
            if (ok) onClose();
          });
        }}
      >
        <div className="campaign-create-way">
          <strong>Join {chosen.campaignName || 'this campaign'}</strong>
          <p className="muted small">
            Your GM sees this name beside the character you pick. You can change it later.
          </p>
          <div className="row">
            <input
              type="text"
              aria-label="Your name at the table"
              placeholder="Your name"
              className="wide-input"
              maxLength={40}
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button type="submit" className="btn primary" disabled={busy}>
              Join
            </button>
            <button type="button" className="btn" onClick={() => setChosen(null)}>
              Back
            </button>
          </div>
        </div>
      </form>
    );
  }

  return (
    <div
      className="card campaign-create"
      data-testid="join-campaign"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="campaign-create-way">
        <strong>Tables on this network</strong>
        {tables.length === 0 ? (
          <p className="muted small" role="status">
            {quiet
              ? 'No tables found. Your GM needs to let players join first. Some networks block this search: enter the address your GM’s Trifold shows instead.'
              : 'Looking for tables…'}
          </p>
        ) : (
          <ul className="join-tables" aria-label="Tables on this network">
            {tables.map((t) => (
              <li key={t.campaignId} className="row">
                <span className="join-table-name">{t.campaignName || 'Unnamed campaign'}</span>
                <span className="muted small">{t.address}</span>
                <span className="spacer" />
                <button
                  type="button"
                  className="btn primary"
                  aria-label={`Join ${t.campaignName || 'this campaign'}`}
                  onClick={() => choose(t)}
                >
                  {t.joined ? 'Join again' : 'Join'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="campaign-create-way">
        {byAddress || (quiet && tables.length === 0) ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (address.trim()) void find();
            }}
          >
            <strong>Enter an address</strong>
            <p className="muted small">
              The address your GM’s Trifold shows under Let players join, such as trifold.local.
            </p>
            <div className="row">
              <input
                type="text"
                aria-label="Table address"
                placeholder="trifold.local"
                className="wide-input"
                spellCheck={false}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
              <button type="submit" className="btn" disabled={!address.trim() || asking}>
                {asking ? 'Looking…' : 'Find'}
              </button>
            </div>
            {problem && (
              <p className="small join-problem" role="alert">
                {problem}
              </p>
            )}
          </form>
        ) : (
          <div className="row">
            <button type="button" className="btn" onClick={() => setByAddress(true)}>
              Enter an address instead
            </button>
          </div>
        )}
      </div>
      <div className="campaign-create-way">
        <strong>From a file</strong>
        <p className="muted small">
          Your GM can send a player pack before the first session, with the campaign’s homebrew and
          companions.
        </p>
        <div className="row">
          <button type="button" className="btn" onClick={() => void choosePack()}>
            Open a player pack…
          </button>
        </div>
        {problem && !byAddress && (
          <p className="small join-problem" role="alert">
            {problem}
          </p>
        )}
      </div>
    </div>
  );
}

import { useState } from 'react';
import { usePlayerTable } from './PlayerTable';

/**
 * Change address (docs/PLAYER-MODE.md, "What the player sees when it fails"): for a network
 * that blocks the search for the GM's table. The player types the address the GM's Trifold
 * shows; main asks it which campaign it is, and when it is this one, keeps the address and
 * connects there. Shown on the VTT tab only while the player is not at the table.
 */
const PROBLEMS = {
  address: 'That is not an address on your local network. Use the one your GM’s Trifold shows.',
  noAnswer:
    'Nothing answered at that address. Check that your GM has let players join and that you are on the same network.',
  otherCampaign: 'The table at that address is running another campaign.',
} as const;

export function ChangeAddress() {
  const { campaign } = usePlayerTable();
  const [open, setOpen] = useState(false);
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  if (!open) {
    return (
      <div className="row change-address">
        <span className="muted small">Some networks block the search for your GM’s table.</span>
        <button type="button" className="btn small" onClick={() => setOpen(true)}>
          Change address
        </button>
      </div>
    );
  }

  const close = () => {
    setOpen(false);
    setProblem(null);
    setAddress('');
  };
  const submit = async () => {
    if (!address.trim() || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const answer = await window.trifold.joined.changeAddress(campaign.campaignId, address);
      if (answer.ok) close();
      else setProblem(PROBLEMS[answer.reason]);
    } catch {
      setProblem(PROBLEMS.noAnswer);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="change-address"
      aria-label="Change address"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          close();
        }
      }}
    >
      <div className="row">
        <label className="field inline grow">
          Address
          <input
            type="text"
            className="grow"
            aria-label="Your GM’s table address"
            placeholder="trifold.local or 192.168.1.23:8130"
            autoFocus
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </label>
        <button type="submit" className="btn primary" disabled={!address.trim() || busy}>
          {busy ? 'Trying…' : 'Connect'}
        </button>
        <button type="button" className="btn" onClick={close}>
          Cancel
        </button>
      </div>
      <p
        className={problem ? 'warn-text small' : 'muted small'}
        role={problem ? 'alert' : undefined}
      >
        {problem ?? 'The address your GM’s Trifold shows under Let players join.'}
      </p>
    </form>
  );
}

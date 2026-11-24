import { useState } from 'react';
import { errorMessage } from '@trifold/schema';
import { useAppStore } from '../../stores/appStore';
import { useCampaignStore } from '../../stores/campaignStore';
import { useJoinedStore } from '../../stores/joinedStore';
import { useShellStore } from '../../stores/shellStore';
import { Icon } from '../shell/icons';

/**
 * The first-run choice (ADR 0077): a new Library asks once, while player mode is on, how it will
 * be used. A game master's gets the sample campaign; a player's opens Join a campaign, with
 * Characters beside it. Settings changes it later.
 */
export function FirstRunChoice() {
  const setRole = useAppStore((s) => s.setRole);
  const setPage = useShellStore((s) => s.setLibraryPage);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = async (role: 'gm' | 'player') => {
    setBusy(true);
    setError(null);
    // The page and the request to open Join a campaign come first: the Campaigns page mounts
    // the moment the role is saved, and reads the request then.
    setPage('campaigns');
    if (role === 'player') useJoinedStore.setState({ wantsJoin: true });
    try {
      await setRole(role);
      if (role === 'gm') await useCampaignStore.getState().load();
    } catch (err) {
      useJoinedStore.setState({ wantsJoin: false });
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="first-run" aria-label="How will you use Trifold?" data-testid="first-run">
      <h2>How will you use Trifold?</h2>
      <p className="muted">You can change this later in Settings.</p>
      {error && (
        <div className="banner error" role="alert">
          <span>{error}</span>
        </div>
      )}
      <div className="first-run-choices">
        <button
          type="button"
          className="first-run-choice"
          disabled={busy}
          onClick={() => void choose('gm')}
        >
          <Icon name="crown" size={20} />
          <strong>Game master</strong>
          <span className="muted small">
            Run campaigns: notes, encounters and fights, the TV and music. Trifold adds a sample
            campaign to explore.
          </span>
        </button>
        <button
          type="button"
          className="first-run-choice"
          disabled={busy}
          onClick={() => void choose('player')}
        >
          <Icon name="person" size={20} />
          <strong>Player</strong>
          <span className="muted small">
            Join your GM&rsquo;s table, keep your characters, and roll from your sheet.
          </span>
        </button>
      </div>
    </section>
  );
}

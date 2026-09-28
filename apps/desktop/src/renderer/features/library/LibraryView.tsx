import { useAppStore } from '../../stores/appStore';
import { useMusicStore } from '../../stores/musicStore';
import { useCampaignStore } from '../../stores/campaignStore';
import { useShellStore, type LibraryPage } from '../../stores/shellStore';
import { MusicFolders } from '../music/MusicFolders';
import { SettingsPage } from '../settings/SettingsPage';
import { Icon, type IconName } from '../shell/icons';
import { CampaignsPage } from './CampaignsPage';
import { CompendiumLibraryPage } from './CompendiumLibraryPage';

const PAGES: Array<{ id: LibraryPage; label: string; icon: IconName }> = [
  { id: 'campaigns', label: 'Campaigns', icon: 'campaign' },
  { id: 'compendium', label: 'Compendium', icon: 'compendium' },
  { id: 'music', label: 'Music folders', icon: 'music' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

/** The Library space (ADR 0004 §1.1): what every campaign shares. No stage, no dock, no tabs. */
export function LibraryView() {
  const page = useShellStore((s) => s.libraryPage);
  const setPage = useShellStore((s) => s.setLibraryPage);
  const campaigns = useCampaignStore((s) => s.campaigns.length);
  const tracks = useMusicStore((s) => s.library?.tracks.length ?? 0);
  const sources = useAppStore((s) => s.library?.settings?.disabledSourceIds.length ?? 0);
  void sources;

  const counts: Partial<Record<LibraryPage, string>> = {
    campaigns: String(campaigns),
    music: `${tracks} tracks`,
    settings: 'Ctrl+,',
  };

  return (
    <div className="library" data-testid="library">
      <nav className="lib-nav" aria-label="Library">
        {PAGES.map((p) => (
          <button
            key={p.id}
            type="button"
            className="lib-row"
            aria-label={p.label}
            aria-current={page === p.id ? 'page' : undefined}
            onClick={() => setPage(p.id)}
          >
            <Icon name={p.icon} size={15} />
            <span className="grow">{p.label}</span>
            {counts[p.id] && (
              <span className={p.id === 'settings' ? 'kbd' : 'muted small'}>{counts[p.id]}</span>
            )}
          </button>
        ))}
        <span className="spacer" />
        <p className="muted small lib-hint">
          Everything here is shared by every campaign. Open a campaign to reach the console.
        </p>
      </nav>
      <div className="lib-content">
        {page === 'campaigns' && <CampaignsPage />}
        {page === 'compendium' && <CompendiumLibraryPage />}
        {page === 'music' && (
          <>
            <h1>Music folders</h1>
            <MusicFolders />
          </>
        )}
        {page === 'settings' && (
          <>
            <h1>Settings</h1>
            <SettingsPage />
          </>
        )}
      </div>
    </div>
  );
}

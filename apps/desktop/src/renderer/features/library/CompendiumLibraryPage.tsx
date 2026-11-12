import { useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import { useSourcesStore } from '../../stores/sourcesStore';
import { CompendiumPage } from '../compendium/CompendiumPage';
import { SourcesCard } from '../settings/SourcesCard';
import { Icon } from '../shell/icons';
import { NewHomebrewPanel } from './NewHomebrewPanel';

/**
 * Library › Compendium (ADR 0004, ADR 0025, ADR 0026): the same browser as the console's
 * Compendium tab with New homebrew beside it, and one button at the top right that swaps the
 * browser for the Sources card and back. On Sources the import button sits beside it. Homebrew
 * is the browser's Source filter, not a view of its own.
 */
type View = 'browse' | 'sources';

export function CompendiumLibraryPage() {
  const [view, setView] = useState<View>('browse');
  const [adding, setAdding] = useState(false);
  const importing = useSourcesStore((s) => s.importing);
  const importFromDialog = useSourcesStore((s) => s.importFromDialog);
  const libraryOk = useAppStore((s) => !!s.library?.ok);
  const sources = view === 'sources';

  return (
    <section className="compendium-library" data-segment={view}>
      <div className="row">
        <h1>{sources ? 'Compendium sources' : 'Compendium'}</h1>
        <span className="spacer" />
        {sources ? (
          <button
            type="button"
            className="btn primary"
            disabled={importing || !libraryOk}
            onClick={() => void importFromDialog()}
          >
            Import Game Master XML…
          </button>
        ) : (
          <button
            type="button"
            className={`btn primary${adding ? ' on' : ''}`}
            aria-expanded={adding}
            disabled={!libraryOk}
            onClick={() => setAdding((v) => !v)}
          >
            <Icon name="plus" />
            New homebrew
          </button>
        )}
        <button
          type="button"
          className="btn"
          aria-label={sources ? 'Back to the compendium' : 'Sources'}
          title={sources ? 'Back to the compendium' : 'Sources: bundled and imported books'}
          onClick={() => {
            setAdding(false);
            setView(sources ? 'browse' : 'sources');
          }}
        >
          <Icon name={sources ? 'compendium' : 'layers'} />
          {sources ? 'Compendium' : 'Sources'}
        </button>
      </div>
      {!sources && adding && <NewHomebrewPanel onClose={() => setAdding(false)} />}
      {sources ? <SourcesCard /> : <CompendiumPage />}
    </section>
  );
}

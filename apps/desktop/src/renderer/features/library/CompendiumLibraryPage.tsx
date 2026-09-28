import { useState } from 'react';
import { useCompendiumStore } from '../../stores/compendiumStore';
import { CompendiumPage } from '../compendium/CompendiumPage';
import { SourcesCard } from '../settings/SourcesCard';

type Segment = 'browse' | 'sources' | 'homebrew';

/** Library › Compendium: Browse (the same search as the console tab), Sources, Homebrew. */
export function CompendiumLibraryPage() {
  const [segment, setSegment] = useState<Segment>('browse');
  const setFilters = useCompendiumStore((s) => s.setFilters);

  const pick = (next: Segment) => {
    setSegment(next);
    // Homebrew is the same browser narrowed to the homebrew source.
    if (next === 'homebrew') setFilters({ sourceIds: ['homebrew'] });
    if (next === 'browse') setFilters({ sourceIds: undefined });
  };

  return (
    <section className="compendium-library">
      <div className="row">
        <h1>Compendium</h1>
        <span className="seg" role="group" aria-label="Compendium section">
          {(
            [
              ['browse', 'Browse'],
              ['sources', 'Sources'],
              ['homebrew', 'Homebrew'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className="btn small"
              aria-pressed={segment === id}
              onClick={() => pick(id)}
            >
              {label}
            </button>
          ))}
        </span>
      </div>
      {segment === 'sources' ? <SourcesCard /> : <CompendiumPage />}
      {segment === 'homebrew' && (
        <p className="muted small">
          Showing homebrew only. Duplicate a record from Browse to start a new one.
        </p>
      )}
    </section>
  );
}

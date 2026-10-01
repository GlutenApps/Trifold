import { useMusicStore } from '../../stores/musicStore';

/** Scan progress, then what the last scan changed. Shared by Library › Music and the Music panel. */
export function ScanStatus() {
  const scan = useMusicStore((s) => s.scan);
  if (!scan) return null;
  let text: string;
  if (scan.phase === 'listing') text = `Found ${scan.found} files…`;
  else if (scan.phase === 'reading')
    text = `Reading ${scan.read}/${scan.found}: ${scan.current ?? ''}`;
  else {
    const changes = [
      scan.added ? `${scan.added} new` : '',
      scan.renamed ? `${scan.renamed} renamed` : '',
      scan.removed ? `${scan.removed} removed` : '',
    ].filter(Boolean);
    text = changes.length ? `Rescanned: ${changes.join(', ')}` : 'Up to date';
  }
  return (
    <span className="muted small scan-status" role="status" title={text}>
      {text}
    </span>
  );
}

/** Music folders (Library › Music folders): files stay where they are; Trifold only remembers them. */
export function MusicFolders() {
  const library = useMusicStore((s) => s.library);
  const addFolder = useMusicStore((s) => s.addFolder);
  const removeFolder = useMusicStore((s) => s.removeFolder);
  const rescan = useMusicStore((s) => s.rescan);
  return (
    <div className="card">
      <h2>Folders</h2>
      {library?.folders.length ? (
        <ul className="picker-list">
          {library.folders.map((f) => (
            <li key={f}>
              <span className="mono small">{f}</span>
              <button type="button" className="btn tiny" onClick={() => void removeFolder(f)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">
          No folders yet. Files stay where they are; Trifold only remembers them.
        </p>
      )}
      <div className="row">
        <button type="button" className="btn primary" onClick={() => void addFolder()}>
          Add folder…
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => void rescan()}
          disabled={!library?.folders.length}
        >
          Rescan
        </button>
        <ScanStatus />
      </div>
    </div>
  );
}

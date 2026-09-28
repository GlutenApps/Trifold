import { useMusicStore } from '../../stores/musicStore';

/** Music folders (Library › Music folders): files stay where they are; Trifold only remembers them. */
export function MusicFolders() {
  const library = useMusicStore((s) => s.library);
  const scan = useMusicStore((s) => s.scan);
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
        {scan && scan.phase !== 'done' && (
          <span className="muted small">
            {scan.phase === 'listing'
              ? `Found ${scan.found} files…`
              : `Reading ${scan.read}/${scan.found}: ${scan.current ?? ''}`}
          </span>
        )}
      </div>
    </div>
  );
}

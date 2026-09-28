import { useState } from 'react';
import { describeLayout, matchesPreset } from '../../stores/shellLayout';
import { useShellStore } from '../../stores/shellStore';
import { Icon } from './icons';

/**
 * The DM's layouts (ADR 0004 §6): apply, overwrite with the screen as it is now, rename,
 * reorder, delete, save the current arrangement as a new one. Nothing is locked.
 */
export function LayoutsTool() {
  const layout = useShellStore((s) => s.layout);
  const presets = useShellStore((s) => s.presets);
  const applyLayout = useShellStore((s) => s.applyLayout);
  const savePreset = useShellStore((s) => s.savePreset);
  const updatePreset = useShellStore((s) => s.updatePreset);
  const renamePreset = useShellStore((s) => s.renamePreset);
  const movePreset = useShellStore((s) => s.movePreset);
  const deletePreset = useShellStore((s) => s.deletePreset);
  const restore = useShellStore((s) => s.restoreStarterLayouts);
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState<{ index: number; value: string } | null>(null);

  return (
    <div className="layouts">
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          savePreset(name);
          setName('');
        }}
      >
        <input
          type="text"
          aria-label="New layout name"
          placeholder="Name the screen as it is now…"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="btn small primary" disabled={!name.trim()}>
          Save current as new
        </button>
      </form>
      <p className="muted small">
        A layout keeps which tabs are open, where, and the dock. Ctrl+1 to Ctrl+9 apply the first
        nine.
      </p>

      {presets.length === 0 && <p className="muted">No layouts yet. Save the screen above.</p>}
      <ol className="layout-list" aria-label="Layouts">
        {presets.map((preset, index) => {
          const current = matchesPreset(layout, preset.layout);
          return (
            <li key={index} className={`layout-row${current ? ' current' : ''}`}>
              <span className="layout-hotkey kbd">{index < 9 ? `Ctrl+${index + 1}` : ''}</span>
              {renaming?.index === index ? (
                <form
                  className="layout-rename"
                  onSubmit={(e) => {
                    e.preventDefault();
                    renamePreset(index, renaming.value);
                    setRenaming(null);
                  }}
                >
                  <input
                    type="text"
                    aria-label="Layout name"
                    value={renaming.value}
                    autoFocus
                    onChange={(e) => setRenaming({ index, value: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setRenaming(null);
                    }}
                  />
                  <button type="submit" className="btn small">
                    Rename
                  </button>
                  <button type="button" className="btn small" onClick={() => setRenaming(null)}>
                    Cancel
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  className="layout-apply"
                  aria-label={`Apply layout ${preset.name}`}
                  aria-current={current ? 'true' : undefined}
                  onClick={() => applyLayout(index)}
                >
                  <strong>
                    {preset.name}
                    {current && <span className="badge roll">current</span>}
                  </strong>
                  <span className="muted small">{describeLayout(preset.layout)}</span>
                </button>
              )}
              <span className="layout-actions">
                <button
                  type="button"
                  className="btn small"
                  title="Overwrite this layout with the screen as it is now"
                  aria-label={`Overwrite layout ${preset.name}`}
                  disabled={current}
                  onClick={() => updatePreset(index)}
                >
                  Overwrite
                </button>
                <button
                  type="button"
                  className="btn small"
                  aria-label={`Rename layout ${preset.name}`}
                  onClick={() => setRenaming({ index, value: preset.name })}
                >
                  Rename
                </button>
                <button
                  type="button"
                  className="chrome-btn xs"
                  aria-label={`Move layout ${preset.name} up`}
                  disabled={index === 0}
                  onClick={() => movePreset(index, -1)}
                >
                  <Icon name="up" size={13} />
                </button>
                <button
                  type="button"
                  className="chrome-btn xs"
                  aria-label={`Move layout ${preset.name} down`}
                  disabled={index === presets.length - 1}
                  onClick={() => movePreset(index, 1)}
                >
                  <Icon name="down" size={13} />
                </button>
                <button
                  type="button"
                  className="chrome-btn xs danger"
                  aria-label={`Delete layout ${preset.name}`}
                  onClick={() => deletePreset(index)}
                >
                  <Icon name="close" size={13} />
                </button>
              </span>
            </li>
          );
        })}
      </ol>
      <div className="row">
        <button type="button" className="btn small" onClick={restore}>
          Bring back the starter layouts
        </button>
        <span className="muted small">Adds Prep, Table and Combat again if you deleted them.</span>
      </div>
    </div>
  );
}

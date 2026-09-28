import { listHotkeys } from '../../hotkeys';

/** The fixed hotkey table, kbd chips in mono. */
export function HotkeysTool() {
  const keys = [...listHotkeys()].sort((a, b) => a.description.localeCompare(b.description));
  return (
    <table className="hotkey-sheet">
      <tbody>
        {keys.map((k) => (
          <tr key={k.id}>
            <td>
              <kbd className="kbd">{k.combo}</kbd>
            </td>
            <td>{k.description}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

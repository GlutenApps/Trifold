import { FOCUSED_KEYS, listHotkeys } from '../../hotkeys';
import { hk } from '../../platform';

/** The fixed hotkey table, kbd chips in mono, then the keys that act on a focused control. */
export function HotkeysTool() {
  const keys = [...listHotkeys()].sort((a, b) => a.description.localeCompare(b.description));
  return (
    <table className="hotkey-sheet">
      <tbody>
        {keys.map((k) => (
          <tr key={k.id}>
            <td>
              <kbd className="kbd">{hk(k.combo)}</kbd>
            </td>
            <td>{k.description}</td>
          </tr>
        ))}
      </tbody>
      {FOCUSED_KEYS.map((group) => (
        <tbody key={group.on}>
          <tr>
            <th colSpan={2} scope="colgroup" className="hotkey-group">
              {group.on}
            </th>
          </tr>
          {group.keys.map((k) => (
            <tr key={k.combo}>
              <td>
                <kbd className="kbd">{hk(k.combo)}</kbd>
              </td>
              <td>{k.description}</td>
            </tr>
          ))}
        </tbody>
      ))}
    </table>
  );
}

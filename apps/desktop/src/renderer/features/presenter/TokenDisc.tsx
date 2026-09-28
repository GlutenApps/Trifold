import type { LiveToken, TokenStyle } from '@trifold/api';
import { initials } from './mapMath';

export interface TokenDiscProps {
  token: Pick<LiveToken, 'label' | 'role' | 'kind' | 'dead'> &
    Partial<Pick<LiveToken, 'artUrl' | 'color'>>;
  style: TokenStyle;
  /** Diameter in CSS pixels (before any parent transform). */
  size: number;
  active?: boolean;
  selected?: boolean;
  hidden?: boolean;
  showLabel?: boolean;
}

/**
 * A token as a disc (DESIGN.md §6.8): custom art when set, otherwise a treated disc with the
 * label's initials. Glyph art from the icon tables arrives in a later slice; the treatments and
 * ring colours are already the final ones so scenes built now keep their look.
 */
export function TokenDisc({
  token,
  style,
  size,
  active,
  selected,
  hidden,
  showLabel = true,
}: TokenDiscProps) {
  const classes = [
    'token-disc',
    `style-${style}`,
    `role-${token.role}`,
    `kind-${token.kind}`,
    token.dead ? 'dead' : '',
    active ? 'active' : '',
    selected ? 'selected' : '',
    hidden ? 'hidden-token' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const glyphStyle = token.color ? { background: token.color } : undefined;
  return (
    <div
      className={classes}
      style={{ width: size, height: size, fontSize: size * 0.34 }}
      title={token.label}
    >
      <div className="token-face" style={glyphStyle}>
        {token.artUrl ? (
          <img src={token.artUrl} alt="" draggable={false} />
        ) : (
          <span className="token-initials">{initials(token.label)}</span>
        )}
      </div>
      {token.dead && <span className="token-dead-mark" aria-label="dead" />}
      {showLabel && (
        <span className="token-label" style={{ fontSize: Math.max(10, size * 0.22) }}>
          {token.label}
        </span>
      )}
    </div>
  );
}

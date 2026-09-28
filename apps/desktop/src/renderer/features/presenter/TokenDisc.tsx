import type { LiveToken, TokenStyle } from '@trifold/api';
import { initials } from './mapMath';

export interface TokenDiscProps {
  token: Pick<LiveToken, 'label' | 'role' | 'kind' | 'dead'> &
    Partial<Pick<LiveToken, 'artUrl' | 'glyphUrl' | 'color'>>;
  style: TokenStyle;
  /** Diameter in CSS pixels (before any parent transform). */
  size: number;
  active?: boolean;
  selected?: boolean;
  hidden?: boolean;
  showLabel?: boolean;
}

/**
 * A token as a disc (DESIGN.md §6.8): custom art when set, else the game-icons glyph masked into
 * a treated disc (engraved, flat, two-tone), else the label's initials. The glyph is a CSS mask
 * so the treatment colours it; Chromium rasterises and caches it per size.
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
        ) : token.glyphUrl && style !== 'plain' ? (
          <span
            className="token-glyph"
            data-testid="token-glyph"
            style={{
              maskImage: `url("${token.glyphUrl}")`,
              WebkitMaskImage: `url("${token.glyphUrl}")`,
            }}
          />
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

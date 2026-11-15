/**
 * A creature's, PC's or NPC's picture (ADR 0033) as a small round thumbnail in a row, or a larger
 * square on a compendium page. Nothing when there is no picture.
 */
export function ArtThumb({
  url,
  size = 'row',
  label,
}: {
  url: string | undefined;
  size?: 'row' | 'page';
  /** Who it shows, for a screen reader; rows usually name them beside it, so empty there. */
  label?: string;
}) {
  if (!url) return null;
  return (
    <img
      className={`art-thumb ${size === 'page' ? 'large' : 'small'}`}
      data-testid="art-thumb"
      src={url}
      alt={label ?? ''}
      draggable={false}
    />
  );
}

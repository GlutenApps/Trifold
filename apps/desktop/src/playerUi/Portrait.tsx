/** A character's portrait, or their initials when there is none. */
export function Portrait({
  url,
  name,
  size,
}: {
  url?: string | undefined;
  name: string;
  size: number;
}) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase();
  return (
    <span className="pc-portrait" style={{ width: size, height: size }} aria-hidden="true">
      {url ? <img src={url} alt="" /> : <span>{initials}</span>}
    </span>
  );
}

/**
 * Ports and addresses for the table server (docs/PLAYER-CONNECTOR.md, "Ports"; ADR 0043).
 */

/** 80 first, so addresses need no port; then 8130–8139. */
export const TABLE_PORTS: readonly number[] = [
  80,
  ...Array.from({ length: 10 }, (_, i) => 8130 + i),
];

/**
 * The ports to try, in order. With no saved port, the full list. With one, that port first (it
 * keeps players' stored tokens valid), then 8130–8139 should something else hold it; 80 is never
 * retried once it failed.
 */
export function portsToTry(saved: number | null): number[] {
  if (!saved) return [...TABLE_PORTS];
  return [saved, ...TABLE_PORTS.filter((p) => p !== 80 && p !== saved)];
}

/** Whether an IPv4 address is on a private LAN (10/8, 172.16/12, 192.168/16). */
export function isPrivateIPv4(ip: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/** Whether an IPv6 address is link-local (fe80::/10) or unique local (fc00::/7). */
export function isPrivateIPv6(ip: string): boolean {
  const first = ip.toLowerCase().split(':')[0] ?? '';
  if (!/^[0-9a-f]{1,4}$/.test(first)) return false;
  const word = parseInt(first.padStart(4, '0'), 16);
  return (word & 0xffc0) === 0xfe80 || (word & 0xfe00) === 0xfc00;
}

/** A remote address the server accepts: private LAN, IPv4-mapped IPv6 included. */
export function isPrivateAddress(ip: string): boolean {
  const bare = ip.replace(/%.*$/, '');
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(bare);
  if (mapped) return isPrivateIPv4(mapped[1]!);
  return isPrivateIPv4(bare) || isPrivateIPv6(bare);
}

/** A host as it appears in a URL or a `Host` header: IPv6 in brackets, zone dropped. */
export function urlHost(host: string): string {
  return host.includes(':') ? `[${host.replace(/%.*$/, '')}]` : host;
}

/** `http://host` with the port only when it is not 80. */
export function tableUrl(host: string, port: number): string {
  return `http://${urlHost(host)}${port === 80 ? '' : `:${port}`}`;
}

/**
 * Whether a request's `Host` header names one of the addresses Trifold shows, which keeps a
 * web page elsewhere from reaching the server through a rebound DNS name.
 */
export function hostAllowed(
  hostHeader: string | undefined,
  hosts: readonly string[],
  port: number,
): boolean {
  if (!hostHeader) return false;
  const h = hostHeader.toLowerCase();
  return hosts.some((host) => {
    const name = urlHost(host).toLowerCase();
    return h === `${name}:${port}` || (port === 80 && h === name);
  });
}

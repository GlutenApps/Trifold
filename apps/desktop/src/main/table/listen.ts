import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os';
import { isPrivateIPv4, isPrivateIPv6 } from '@trifold/rules';

/** A private address Trifold may listen on, and the interface it belongs to. */
export interface LanAddress {
  host: string;
  family: 'IPv4' | 'IPv6';
  iface: string;
  /** Dotted IPv4 netmask, or the IPv6 one; used to answer mDNS with an address on the asker's subnet. */
  netmask: string;
}

/**
 * Adapters that are rarely the table's Wi-Fi: virtual switches, VMs, containers, VPN tunnels.
 * They still get listeners, but their addresses go after the real ones, so the QR code shows an
 * address a phone can reach.
 */
const VIRTUAL =
  /vethernet|virtualbox|vmware|vmnet|vbox|wsl|docker|hyper-v|loopback|utun|bridge|tailscale|zerotier/i;

/**
 * The machine's private LAN addresses (ADR 0043): IPv4 in 10/8, 172.16/12 and 192.168/16, and
 * IPv6 link-local or unique local. Real adapters first, then 192.168 before 10 before 172.
 */
export function lanAddresses(
  interfaces: NodeJS.Dict<NetworkInterfaceInfo[]> = networkInterfaces(),
): LanAddress[] {
  const out: Array<LanAddress & { rank: number }> = [];
  for (const [iface, infos] of Object.entries(interfaces)) {
    for (const info of infos ?? []) {
      if (info.internal) continue;
      const virtual = VIRTUAL.test(iface) ? 10 : 0;
      if (info.family === 'IPv4' && isPrivateIPv4(info.address)) {
        const block = info.address.startsWith('192.168.')
          ? 0
          : info.address.startsWith('10.')
            ? 1
            : 2;
        out.push({
          host: info.address,
          family: 'IPv4',
          iface,
          netmask: info.netmask,
          rank: virtual + block,
        });
      } else if (info.family === 'IPv6' && isPrivateIPv6(info.address)) {
        const linkLocal = info.address.toLowerCase().startsWith('fe8');
        const host = linkLocal && info.scopeid ? `${info.address}%${info.scopeid}` : info.address;
        out.push({ host, family: 'IPv6', iface, netmask: info.netmask, rank: 20 + virtual });
      }
    }
  }
  return out.sort((a, b) => a.rank - b.rank).map(({ rank: _rank, ...a }) => a);
}

export interface BoundListener {
  host: string;
  close(): Promise<void>;
}

/** Binds one listener; rejects with the socket error (its `code` says why). */
export type BindFn = (host: string, port: number) => Promise<BoundListener>;

const MOVE_ON = new Set(['EADDRINUSE', 'EACCES', 'EADDRNOTAVAIL']);

/**
 * Finds the first port every IPv4 address binds on (PLAYER-CONNECTOR.md, "Ports"): a port in use or
 * refused on
 * any IPv4 address moves on to the next. IPv6 addresses then bind on that port where they can;
 * one that fails is skipped. Throws when no port works or there is no private IPv4 address.
 */
export async function listenOnFirstFreePort(
  addresses: readonly LanAddress[],
  ports: readonly number[],
  bind: BindFn,
): Promise<{ port: number; listeners: BoundListener[]; skipped: string[] }> {
  const v4 = addresses.filter((a) => a.family === 'IPv4');
  const v6 = addresses.filter((a) => a.family === 'IPv6');
  if (!v4.length) throw new Error('No private network address. Join a Wi-Fi network first.');
  let lastError: unknown = null;
  for (const port of ports) {
    const bound: BoundListener[] = [];
    let failed = false;
    for (const a of v4) {
      try {
        bound.push(await bind(a.host, port));
      } catch (err) {
        lastError = err;
        failed = true;
        break;
      }
    }
    if (failed) {
      await Promise.all(bound.map((l) => l.close()));
      const code = (lastError as { code?: string }).code ?? '';
      if (!MOVE_ON.has(code)) throw lastError;
      continue;
    }
    const skipped: string[] = [];
    for (const a of v6) {
      try {
        bound.push(await bind(a.host, port));
      } catch {
        skipped.push(a.host);
      }
    }
    return { port, listeners: bound, skipped };
  }
  const tried = ports.join(', ');
  throw new Error(`No free port (tried ${tried}).`, { cause: lastError });
}

/**
 * IPv4 arithmetic for the IP & VLAN plan (SDS Doc 24). Pure and client-safe.
 * Addresses are handled as unsigned 32-bit numbers so ranges, containment
 * and overlaps are plain comparisons. Sizes and usable ranges are always
 * worked out here from network and prefix, never typed in.
 */

const OCTETS = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** "10.1.2.3" → number, or null if it is not a dotted IPv4 address. */
export function ipToNumber(value: string): number | null {
  const match = OCTETS.exec(value.trim());
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  if (parts.some((part) => part > 255)) return null;
  return ((parts[0]! * 256 + parts[1]!) * 256 + parts[2]!) * 256 + parts[3]!;
}

export function numberToIp(value: number): string {
  return [24, 16, 8, 0].map((shift) => Math.floor(value / 2 ** shift) % 256).join(".");
}

export function isIpv4(value: string): boolean {
  return ipToNumber(value) !== null;
}

/** Number of addresses in a block of this prefix. */
export function blockSize(prefix: number): number {
  return 2 ** (32 - prefix);
}

export function prefixToMask(prefix: number): string {
  return numberToIp(2 ** 32 - blockSize(prefix));
}

/** "255.255.252.0" → 22, or null when the mask is not contiguous. */
export function maskToPrefix(mask: string): number | null {
  const value = ipToNumber(mask);
  if (value === null) return null;
  for (let prefix = 0; prefix <= 32; prefix += 1) {
    if (2 ** 32 - blockSize(prefix) === value) return prefix;
  }
  return null;
}

export interface Cidr {
  network: string;
  prefix: number;
  start: number;
  end: number;
}

export type CidrResult = { ok: true; cidr: Cidr } | { ok: false; error: string };

/**
 * Read a subnet written as "10.1.0.0/22", "10.1.0.0 255.255.252.0" or
 * "10.1.0.0/255.255.252.0". An address inside the block ("10.1.2.5/22") is
 * refused rather than quietly rounded, since it usually means a typo.
 */
export function parseCidr(raw: string): CidrResult {
  const value = raw.trim().replace(/\s*\/\s*/, "/");
  const [address, rest] = value.includes("/") ? value.split("/") : value.split(/\s+/);
  if (!address || !rest) return { ok: false, error: "Write it as network/prefix, e.g. 10.100.100.0/24." };
  const start = ipToNumber(address);
  if (start === null) return { ok: false, error: `"${address}" is not an IPv4 address.` };
  const prefix = /^\d{1,2}$/.test(rest) ? Number(rest) : maskToPrefix(rest);
  if (prefix === null || prefix < 8 || prefix > 32) return { ok: false, error: "The prefix must be between /8 and /32." };
  const size = blockSize(prefix);
  if (start % size !== 0) {
    const network = numberToIp(start - (start % size));
    return { ok: false, error: `${address}/${prefix} is not a network address. Did you mean ${network}/${prefix}?` };
  }
  return { ok: true, cidr: { network: address, prefix, start, end: start + size - 1 } };
}

export function cidrFromParts(network: string, prefix: number): Cidr {
  const start = ipToNumber(network) ?? 0;
  return { network, prefix, start, end: start + blockSize(prefix) - 1 };
}

export interface SubnetFacts {
  cidr: string;
  mask: string;
  size: number;
  /** Addresses a host can use: all but network and broadcast (all for /31 and /32). */
  usable: number;
  firstUsable: string;
  lastUsable: string;
  broadcast: string | null;
}

export function subnetFacts(network: string, prefix: number): SubnetFacts {
  const { start, end } = cidrFromParts(network, prefix);
  const size = blockSize(prefix);
  const pointToPoint = prefix >= 31;
  return {
    cidr: `${network}/${prefix}`,
    mask: prefixToMask(prefix),
    size,
    usable: pointToPoint ? size : size - 2,
    firstUsable: numberToIp(pointToPoint ? start : start + 1),
    lastUsable: numberToIp(pointToPoint ? end : end - 1),
    broadcast: pointToPoint ? null : numberToIp(end),
  };
}

export function contains(range: { start: number; end: number }, address: number): boolean {
  return address >= range.start && address <= range.end;
}

export function overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start <= b.end && b.start <= a.end;
}

/**
 * The first usable address not taken. The gateway and anything recorded
 * count as taken.
 */
export function nextFree(network: string, prefix: number, taken: Iterable<number>): string | null {
  const { start, end } = cidrFromParts(network, prefix);
  const used = new Set(taken);
  const first = prefix >= 31 ? start : start + 1;
  const last = prefix >= 31 ? end : end - 1;
  for (let address = first; address <= last; address += 1) {
    if (!used.has(address)) return numberToIp(address);
  }
  return null;
}

/** "AA-BB-CC-DD-EE-FF", "aabb.ccdd.eeff" → "aa:bb:cc:dd:ee:ff". */
export function normalizeMac(raw: string | null | undefined): string | null {
  const hex = (raw ?? "").replace(/[^0-9a-f]/gi, "").toLowerCase();
  if (hex.length !== 12) return null;
  return hex.match(/../g)!.join(":");
}

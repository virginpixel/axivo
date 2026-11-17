import { plain } from "./config-parse";

/**
 * Which addresses a switch routes, from its saved configuration, and what its
 * ARP table says is alive behind them (SDS Doc 24, IP & VLAN plan). Pure.
 */

export interface RoutedNetwork {
  /** "Vlan50", "vlan 50", "GigabitEthernet1/0/1". */
  interface: string;
  address: string;
  prefix: number;
}

const DOTTED = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function maskBits(mask: string): number | null {
  const m = DOTTED.exec(mask);
  if (!m) return null;
  const bits = m.slice(1).map((octet) => Number(octet).toString(2).padStart(8, "0")).join("");
  if (!/^1*0*$/.test(bits)) return null;
  const zero = bits.indexOf("0");
  return zero === -1 ? 32 : zero;
}

/**
 * The addresses a device routes, from its running configuration: each
 * interface (usually a VLAN interface) with an "ip address", primary and
 * secondary. Cisco writes "ip address 10.1.1.1 255.255.255.0", Aruba CX
 * "ip address 10.1.1.1/24", ProCurve puts it under "vlan 50".
 */
export function routedNetworks(config: string): RoutedNetwork[] {
  const found: RoutedNetwork[] = [];
  let current: string | null = null;
  for (const raw of config.split("\n")) {
    const line = raw.replace(/\s+$/, "");
    const indented = /^\s/.test(line);
    if (!indented) {
      const header = /^(?:interface\s+(.+)|vlan\s+(\d+))$/i.exec(line.trim());
      if (header) current = header[1] ?? `vlan ${header[2]}`;
      else if (line.trim() !== "" && !/^(!|exit)/i.test(line.trim())) current = null;
      continue;
    }
    if (!current) continue;
    const cidr = /^\s+ip(?:v4)? address\s+(\d+\.\d+\.\d+\.\d+)\/(\d{1,2})\b/i.exec(line);
    const masked = /^\s+ip address\s+(\d+\.\d+\.\d+\.\d+)\s+(\d+\.\d+\.\d+\.\d+)/i.exec(line);
    if (cidr) {
      found.push({ interface: current, address: cidr[1]!, prefix: Number(cidr[2]) });
    } else if (masked) {
      const prefix = maskBits(masked[2]!);
      if (prefix !== null) found.push({ interface: current, address: masked[1]!, prefix });
    }
  }
  return found;
}

export interface ArpEntry {
  address: string;
  mac: string;
}

const IP_IN_LINE = /\b(\d{1,3}(?:\.\d{1,3}){3})\b/;
const MAC_IN_LINE = /\b([0-9a-f]{4}\.[0-9a-f]{4}\.[0-9a-f]{4}|[0-9a-f]{2}(?:[:-][0-9a-f]{2}){5}|[0-9a-f]{6}-[0-9a-f]{6})\b/i;

/**
 * Entries of an ARP table as any of the four CLI families print it. The
 * switch's own addresses (Cisco shows their age as "-") and incomplete
 * entries are left out.
 */
export function parseArp(text: string): ArpEntry[] {
  const entries = new Map<string, ArpEntry>();
  for (const line of plain(text).split("\n")) {
    if (/incomplete/i.test(line)) continue;
    if (/^\s*Internet\s+\S+\s+-\s/.test(line)) continue;
    const ip = IP_IN_LINE.exec(line)?.[1];
    const mac = MAC_IN_LINE.exec(line)?.[1];
    if (!ip || !mac) continue;
    const hex = mac.replace(/[^0-9a-f]/gi, "").toLowerCase();
    if (hex.length !== 12 || /^0+$|^f+$/.test(hex)) continue;
    entries.set(ip, { address: ip, mac: hex.match(/../g)!.join(":") });
  }
  return [...entries.values()];
}

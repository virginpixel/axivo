/**
 * Reading what a switch prints: which family it is, what it says about itself
 * (model, serial, firmware) and its running configuration, cleaned of the
 * session around it. Pure and client-safe, so the version screens can use the
 * line diff too. (SDS Doc 24, configuration backups.)
 */

/** CLI families with their own commands. Named after the discovery collector's. */
export type ConfigFamily = "ios" | "sb" | "procurve" | "aoscx";

export const FAMILY_LABELS: Record<ConfigFamily, string> = {
  ios: "Cisco IOS / IOS XE",
  sb: "Cisco small business",
  procurve: "Aruba / HP ProCurve",
  aoscx: "ArubaOS-CX",
};

/** Turns paging off for the session. */
export const PAGING_OFF: Record<ConfigFamily, string> = {
  ios: "terminal length 0",
  sb: "terminal datadump",
  procurve: "no page",
  aoscx: "no page",
};

/** Extra read-only commands each family needs to describe itself. */
export const IDENTITY_COMMANDS: Record<ConfigFamily, string[]> = {
  ios: ["show inventory"],
  sb: ["show system", "show inventory"],
  procurve: ["show system"],
  aoscx: ["show system"],
};

const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;

/** Strip colour codes, pager leftovers and backspaces; normalise line ends. */
export function plain(text: string): string {
  let out = text.replace(ANSI, "");
  // A pager erases its "--More--" with backspaces; drop each with what it erased.
  while (/[^\x08]\x08/.test(out)) out = out.replace(/[^\x08]\x08/g, "");
  out = out.replace(/\x08/g, "");
  out = out.replace(/\s*--\s*more\s*--\s*/gi, "\n");
  return out.replace(/\r\n?/g, "\n");
}

/** Which CLI the device speaks, from its banner and `show version`. */
export function detectFamily(text: string, manufacturer = ""): ConfigFamily {
  if (/ArubaOS-CX|AOS-CX/i.test(text)) return "aoscx";
  // IOS first: its `show version` has a "SW Version" column, which is also
  // what the small-business check below looks for.
  if (/Cisco IOS/.test(text)) return "ios";
  if (/ProCurve|ArubaOS|Image stamp|HP J\d|Software revision/i.test(text) || /^(hp|aruba)/i.test(manufacturer)) {
    return "procurve";
  }
  if (/SW version|Active-image|SG3\d\d|C1200|C1300|CBS\d/i.test(text)) return "sb";
  return "ios";
}

export interface DeviceIdentity {
  operatingSystem: string | null;
  model: string | null;
  serialNumber: string | null;
  version: string | null;
}

function first(pattern: RegExp, text: string): string | null {
  const match = pattern.exec(text);
  const value = match?.[1]?.trim();
  return value ? value : null;
}

const PROCURVE_MODELS: Record<string, string> = {
  YB: "Aruba 2530", YA: "Aruba 2530", WC: "Aruba 2930F", WB: "Aruba 2920",
  KB: "Aruba 5400R", KA: "HP 3800", RA: "HP 2620", WA: "Aruba 3810",
};

/**
 * What the device says about itself. Each field is null when the output does
 * not say, so a short or odd answer never blanks what the register holds.
 */
export function parseIdentity(family: ConfigFamily, outputs: Record<string, string>): DeviceIdentity {
  const version = plain(outputs["show version"] ?? "");
  const system = plain(outputs["show system"] ?? "");
  const inventory = plain(outputs["show inventory"] ?? "");

  if (family === "ios") {
    // The chassis line of `show inventory`: the first PID that is a switch.
    const chassis = /PID:\s*((?:WS-|C\d|IE-|ISR|N\dK|C9)\S*)\s*,.*?SN:\s*(\S+)/s.exec(inventory);
    return {
      operatingSystem: /IOS[ -]XE/.test(version) ? "Cisco IOS-XE" : /NX-OS/.test(version) ? "Cisco NX-OS" : "Cisco IOS",
      model: first(/Model [Nn]umber\s*:\s*(\S+)/, version) ?? first(/^cisco (\S+) .*processor/m, version) ?? chassis?.[1] ?? null,
      serialNumber: first(/System [Ss]erial [Nn]umber\s*:\s*(\S+)/, version) ?? chassis?.[2] ?? first(/Processor board ID (\S+)/, version),
      version:
        first(/Cisco IOS XE Software, Version\s+(\S+)/, version) ??
        first(/Cisco IOS Software.*?Version\s+([^\s,]+)/, version) ??
        first(/NXOS: version\s+(\S+)/i, version),
    };
  }
  if (family === "aoscx") {
    const all = `${system}\n${version}`;
    return {
      operatingSystem: "ArubaOS-CX",
      model: first(/^Product Name\s*:\s*(.+?)\s*$/m, all),
      serialNumber: first(/^Chassis Serial Nbr\s*:\s*(\S+)/m, all) ?? first(/Serial (?:Number|Nbr)\s*:\s*(\S+)/, all),
      version: first(/^Version\s*:\s*(\S+)/m, all),
    };
  }
  if (family === "procurve") {
    const revision = first(/Software revision\s*:\s*(\S+)/, system);
    return {
      operatingSystem: "ArubaOS-Switch (ProCurve)",
      model: revision ? PROCURVE_MODELS[revision.slice(0, 2)] ?? null : null,
      serialNumber: first(/Serial Number\s*:\s*(\S+)/, system),
      version: revision,
    };
  }
  return {
    operatingSystem: "Cisco SB",
    model: first(/PID:\s*(\S+)/, inventory) ?? first(/^System Description\s*:\s*(.+?)\s*$/m, system),
    serialNumber: first(/SN:\s*(\S+)/, inventory),
    version: first(/Version:\s*(\S+)/, version) ?? first(/^(?:SW|Software) [Vv]ersion\s*:?\s*(\S+)/m, version),
  };
}

/**
 * The configuration alone: no echoed command, no trailing prompt, no
 * "Building configuration..." preamble. Blank lines at the ends go too.
 */
export function cleanConfig(raw: string, command: string, prompt: string | null): string {
  const lines = plain(raw).split("\n").map((line) => line.replace(/\s+$/, ""));
  // Drop everything up to and including the echoed command.
  const echo = lines.findIndex((line) => line.includes(command));
  let body = echo >= 0 ? lines.slice(echo + 1) : lines;
  // And the prompt the device printed when it finished.
  while (body.length > 0) {
    const last = body[body.length - 1]!.trim();
    if (last === "" || (prompt && last.startsWith(prompt.trim())) || /^[\w.\-()/]+\s?[>#]$/.test(last)) {
      body = body.slice(0, -1);
    } else break;
  }
  while (body.length > 0) {
    const head = body[0]!.trim();
    if (head === "" || /^Building configuration/i.test(head) || /^Current configuration\s*:/i.test(head)) {
      body = body.slice(1);
    } else break;
  }
  return body.join("\n");
}

/**
 * Lines that change on their own (clocks, counters) and say nothing about the
 * configuration. Left in the saved copy, but ignored when deciding whether
 * anything changed, or every night would be a "change".
 */
const VOLATILE = [
  /^!\s*Last configuration change at/i,
  /^!\s*NVRAM config last updated at/i,
  /^!\s*No configuration change since last restart/i,
  /^!\s*Time:/i,
  /^ntp clock-period/i,
  /^Current configuration\s*:/i,
  /^; .*Configuration Editor; Created on release/i,
];

export function comparable(config: string): string {
  return config
    .split("\n")
    .filter((line) => !VOLATILE.some((pattern) => pattern.test(line.trim())))
    .join("\n")
    .trim();
}

/** Signs that the device refused the command rather than printing a config. */
export function looksLikeConfig(config: string): boolean {
  const lines = config.split("\n").filter((line) => line.trim() !== "");
  if (lines.length < 5) return false;
  if (/(% ?Invalid input|% ?Incomplete command|% ?Authorization failed|Unrecognized command|Invalid command)/i.test(lines.slice(0, 3).join("\n"))) {
    return false;
  }
  return true;
}

export type DiffLine = { kind: "same" | "added" | "removed"; text: string; oldNo: number | null; newNo: number | null };

/**
 * Line diff (longest common subsequence). Configurations run to a few
 * thousand lines, so the shared head and tail are trimmed first and the table
 * is built only over the part that differs.
 */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before === "" ? [] : before.split("\n");
  const b = after === "" ? [] : after.split("\n");
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head += 1;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail += 1;
  const midA = a.slice(head, a.length - tail);
  const midB = b.slice(head, b.length - tail);

  const out: DiffLine[] = [];
  for (let i = 0; i < head; i += 1) out.push({ kind: "same", text: a[i]!, oldNo: i + 1, newNo: i + 1 });

  if (midA.length * midB.length > 4_000_000) {
    // Too different to align line by line; show it as replaced.
    midA.forEach((text, i) => out.push({ kind: "removed", text, oldNo: head + i + 1, newNo: null }));
    midB.forEach((text, i) => out.push({ kind: "added", text, oldNo: null, newNo: head + i + 1 }));
  } else {
    const rows = midA.length + 1;
    const cols = midB.length + 1;
    const table = new Uint32Array(rows * cols);
    for (let i = midA.length - 1; i >= 0; i -= 1) {
      for (let j = midB.length - 1; j >= 0; j -= 1) {
        table[i * cols + j] =
          midA[i] === midB[j]
            ? table[(i + 1) * cols + j + 1]! + 1
            : Math.max(table[(i + 1) * cols + j]!, table[i * cols + j + 1]!);
      }
    }
    let i = 0;
    let j = 0;
    while (i < midA.length || j < midB.length) {
      if (i < midA.length && j < midB.length && midA[i] === midB[j]) {
        out.push({ kind: "same", text: midA[i]!, oldNo: head + i + 1, newNo: head + j + 1 });
        i += 1;
        j += 1;
      } else if (j < midB.length && (i === midA.length || table[i * cols + j + 1]! >= table[(i + 1) * cols + j]!)) {
        out.push({ kind: "added", text: midB[j]!, oldNo: null, newNo: head + j + 1 });
        j += 1;
      } else {
        out.push({ kind: "removed", text: midA[i]!, oldNo: head + i + 1, newNo: null });
        i += 1;
      }
    }
  }

  for (let k = 0; k < tail; k += 1) {
    const oldNo = a.length - tail + k;
    const newNo = b.length - tail + k;
    out.push({ kind: "same", text: a[oldNo]!, oldNo: oldNo + 1, newNo: newNo + 1 });
  }
  return out;
}

/** Added and removed line counts for a version's summary. */
export function diffCounts(before: string, after: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of diffLines(before, after)) {
    if (line.kind === "added") added += 1;
    else if (line.kind === "removed") removed += 1;
  }
  return { added, removed };
}

/**
 * Whether the nightly run is due: past the chosen hour in the organisation's
 * timezone, and no nightly run has started yet that local day.
 */
export function scheduledRunDue(now: Date, timeZone: string, hour: number, lastScheduledStart: Date | null): boolean {
  const local = (date: Date) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
    return { day: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
  };
  const today = local(now);
  if (today.hour < hour) return false;
  // The very first run waits for the hour itself, so turning this on (or
  // updating Axivo) in the middle of the working day does not log in to every
  // switch there and then. After that, a run missed while the worker was down
  // is caught up later the same day.
  if (!lastScheduledStart) return today.hour === hour;
  return local(lastScheduledStart).day !== today.day;
}

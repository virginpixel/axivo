/**
 * The ports a service listens on, as people type them: "8080", "80, 443",
 * "8443/tcp", "5000-5010", "53/udp". Client-safe (SDS Doc 24).
 */

const TOKEN = /^(\d{1,5})(?:-(\d{1,5}))?(?:\/(tcp|udp))?$/i;

export type PortsResult = { ok: true; value: string | null } | { ok: false; error: string };

/** Check and tidy a ports list: one comma-separated spelling, so search finds it. */
export function normalizePorts(raw: string | null | undefined): PortsResult {
  const tokens = (raw ?? "").split(/[\s,;]+/).filter(Boolean);
  if (tokens.length === 0) return { ok: true, value: null };
  const out: string[] = [];
  for (const token of tokens) {
    const match = TOKEN.exec(token);
    if (!match) return { ok: false, error: `"${token}" is not a port. Use numbers like 8080, 80-90 or 53/udp.` };
    const from = Number(match[1]);
    const to = match[2] ? Number(match[2]) : null;
    if (from < 1 || from > 65535 || (to !== null && (to < 1 || to > 65535))) {
      return { ok: false, error: `${token}: ports run from 1 to 65535.` };
    }
    if (to !== null && to < from) return { ok: false, error: `${token}: a range goes from the lower port to the higher.` };
    const spelled = `${from}${to !== null ? `-${to}` : ""}${match[3] ? `/${match[3].toLowerCase()}` : ""}`;
    if (!out.includes(spelled)) out.push(spelled);
  }
  return { ok: true, value: out.join(", ") };
}

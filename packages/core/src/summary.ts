import type { DailyRollup, Incident, Site, SiteState, Status } from "./types.js";
import type { Store } from "./store.js";

export interface DayBar { date: string; uptime: number | null; avgLatencyMs: number | null; down: number; }
export interface LatencyPoint { t: string; ms: number | null; status: Status; }
export interface SiteSummary {
  id: string; name: string; url: string; note: string | null;
  status: Status | "unknown"; checkedAt: string | null; latencyMs: number | null; reason: string | null;
  uptime: { d1: number | null; d7: number | null; d30: number | null; d90: number | null };
  days: DayBar[];          // last 90 days, oldest first
  latency24h: LatencyPoint[];
}
export interface IncidentSummary extends Incident { siteName: string; durationMin: number | null; }
export interface StatusPayload {
  generatedAt: string;
  sample?: boolean;
  overall: { status: "operational" | "degraded" | "partial" | "major" | "unknown"; label: string };
  sites: SiteSummary[];
  incidents: IncidentSummary[]; // last 30 days, newest first
}

const DAY_MS = 86_400_000;
const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Up and degraded both count as available; only "down" counts against uptime. */
export function uptimeOf(days: Pick<DailyRollup, "up" | "degraded" | "down">[]): number | null {
  let ok = 0, total = 0;
  for (const d of days) { ok += d.up + d.degraded; total += d.up + d.degraded + d.down; }
  return total ? ok / total : null;
}

export function overallOf(statuses: (Status | "unknown")[]): StatusPayload["overall"] {
  const known = statuses.filter((s) => s !== "unknown");
  if (!known.length) return { status: "unknown", label: "Waiting for the first checks" };
  const down = known.filter((s) => s === "down").length;
  if (down === known.length) return { status: "major", label: "Major outage" };
  if (down) return { status: "partial", label: down === 1 ? "1 site is down" : `${down} sites are down` };
  if (known.includes("degraded")) return { status: "degraded", label: "Some sites are slow" };
  return { status: "operational", label: "All systems operational" };
}

export async function buildStatus(store: Store, sites: Site[], nowMs = Date.now()): Promise<StatusPayload> {
  const since24h = new Date(nowMs - DAY_MS).toISOString();
  const from90 = isoDate(nowMs - 89 * DAY_MS);
  const states = new Map((await store.listStates()).map((s) => [s.siteId, s] as const));

  const summaries = await Promise.all(sites.map(async (site): Promise<SiteSummary> => {
    const [daily, checks] = await Promise.all([store.listDaily(site.id, from90), store.listChecks(site.id, since24h)]);
    const byDate = new Map(daily.map((d) => [d.date, d] as const));
    const days: DayBar[] = Array.from({ length: 90 }, (_, i) => {
      const date = isoDate(nowMs - (89 - i) * DAY_MS);
      const d = byDate.get(date);
      return { date, uptime: d ? uptimeOf([d]) : null, avgLatencyMs: d?.latencyCount ? Math.round(d.latencySum / d.latencyCount) : null, down: d?.down ?? 0 };
    });
    const lastN = (n: number) => daily.filter((d) => d.date >= isoDate(nowMs - (n - 1) * DAY_MS));
    const state: SiteState | undefined = states.get(site.id);
    return {
      id: site.id, name: site.name, url: site.url, note: site.note ?? null,
      status: state?.status ?? "unknown", checkedAt: state?.checkedAt ?? null, latencyMs: state?.latencyMs ?? null, reason: state?.reason ?? null,
      uptime: { d1: uptimeOf(checks.map(toCount)), d7: uptimeOf(lastN(7)), d30: uptimeOf(lastN(30)), d90: uptimeOf(daily) },
      days,
      latency24h: checks.map((c) => ({ t: c.checkedAt, ms: c.latencyMs, status: c.status })),
    };
  }));

  const names = new Map(sites.map((s) => [s.id, s.name] as const));
  const incidents = (await store.listIncidents(new Date(nowMs - 30 * DAY_MS).toISOString()))
    .filter((i) => names.has(i.siteId))
    .map((i) => ({ ...i, siteName: names.get(i.siteId)!, durationMin: i.end ? Math.max(1, Math.round((Date.parse(i.end) - Date.parse(i.start)) / 60_000)) : null }));

  return { generatedAt: new Date(nowMs).toISOString(), overall: overallOf(summaries.map((s) => s.status)), sites: summaries, incidents };
}

function toCount(c: { status: Status }) {
  return { up: c.status === "up" ? 1 : 0, degraded: c.status === "degraded" ? 1 : 0, down: c.status === "down" ? 1 : 0 };
}

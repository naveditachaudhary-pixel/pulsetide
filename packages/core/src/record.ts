import type { CheckResult, Incident, SiteState } from "./types.js";
import { invert, type Store } from "./store.js";

/**
 * Save a check and keep everything derived from it up to date:
 * the daily rollup, the site's latest state, and incidents (opened when a site goes down,
 * closed when it comes back).
 */
export async function recordResult(store: Store, c: CheckResult): Promise<void> {
  await store.addCheck(c);

  const date = c.checkedAt.slice(0, 10);
  const day = (await store.getDaily(c.siteId, date)) ?? { siteId: c.siteId, date, up: 0, degraded: 0, down: 0, latencySum: 0, latencyCount: 0 };
  day[c.status] += 1;
  if (c.latencyMs !== null) { day.latencySum += c.latencyMs; day.latencyCount += 1; }
  await store.putDaily(day);

  const prev = await store.getState(c.siteId);
  let openIncidentId = prev?.openIncidentId ?? null;
  if (c.status === "down" && !openIncidentId) {
    const incident: Incident = { siteId: c.siteId, id: invert(c.checkedAt), start: c.checkedAt, end: null, cause: c.reason ?? "Unreachable" };
    await store.putIncident(incident);
    openIncidentId = incident.id;
  } else if (c.status !== "down" && openIncidentId) {
    const open = (await store.listIncidents("0000")).find((i) => i.siteId === c.siteId && i.id === openIncidentId);
    if (open) await store.putIncident({ ...open, end: c.checkedAt });
    openIncidentId = null;
  }

  const state: SiteState = { siteId: c.siteId, status: c.status, checkedAt: c.checkedAt, latencyMs: c.latencyMs, reason: c.reason, openIncidentId };
  await store.putState(state);
}

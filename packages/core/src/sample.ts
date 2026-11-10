import { recordResult } from "./record.js";
import type { Store } from "./store.js";
import type { Site, Status } from "./types.js";

/**
 * Fill a store with made-up history so the dashboard can be previewed locally before any real
 * checks exist. Only used by the local preview server, never in Azure. The API marks this data
 * as sample data and the dashboard says so.
 */
export async function simulateHistory(store: Store, sites: Site[], nowMs = Date.now(), seed = 7): Promise<void> {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const DAY = 86_400_000, STEP = 5 * 60_000;
  for (const [index, site] of sites.entries()) {
    const base = 120 + index * 90;
    // Older days: write daily rollups directly (288 checks a day).
    for (let d = 89; d >= 1; d--) {
      const date = new Date(nowMs - d * DAY).toISOString().slice(0, 10);
      const down = rand() < 0.05 ? Math.ceil(rand() * 12) : 0;
      const degraded = rand() < 0.15 ? Math.ceil(rand() * 6) : 0;
      const up = 288 - down - degraded;
      await store.putDaily({ siteId: site.id, date, up, degraded, down, latencySum: (up + degraded) * (base + rand() * 60), latencyCount: up + degraded });
    }
    // Last 24 hours: real check records, with one short outage on the second site.
    for (let t = nowMs - DAY + STEP; t <= nowMs; t += STEP) {
      const outage = index === 1 && t > nowMs - 9.2 * 3_600_000 && t < nowMs - 8.9 * 3_600_000;
      const ms = Math.round(base + rand() * 80 + (rand() < 0.03 ? 2600 : 0));
      const status: Status = outage ? "down" : ms >= (site.slowMs ?? 2500) ? "degraded" : "up";
      await recordResult(store, {
        siteId: site.id, checkedAt: new Date(t).toISOString(), status,
        latencyMs: outage ? null : ms, httpStatus: outage ? 503 : 200,
        reason: outage ? "HTTP 503" : status === "degraded" ? `Slow response (${(ms / 1000).toFixed(1)} s)` : null,
      });
    }
  }
}

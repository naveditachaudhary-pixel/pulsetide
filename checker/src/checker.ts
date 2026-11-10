import type { InvocationContext, Timer } from "@azure/functions";
import { runChecks, type CheckOptions, type Site, type Store } from "@pulsetide/core";

/** The timer job: check every site and log a one-line summary per site to the function logs. */
export function createChecker(getStore: () => Promise<Store>, sites: Site[], opts: CheckOptions = {}) {
  return async (_timer: Timer, context: InvocationContext): Promise<void> => {
    const store = await getStore();
    const results = await runChecks(store, sites, opts);
    for (const r of results) {
      const line = `${r.siteId}: ${r.status}${r.latencyMs !== null ? ` in ${r.latencyMs} ms` : ""}${r.reason ? ` (${r.reason})` : ""}`;
      if (r.status === "down") context.warn(line); else context.log(line);
    }
  };
}

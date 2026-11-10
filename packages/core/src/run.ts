import { checkSite, type CheckOptions } from "./check.js";
import { recordResult } from "./record.js";
import type { Store } from "./store.js";
import type { CheckResult, Site } from "./types.js";

const KEEP_RAW_DAYS = 30;

/** One full round: check every site in parallel, record the results, and trim old raw checks once a day. */
export async function runChecks(store: Store, sites: Site[], opts: CheckOptions = {}): Promise<CheckResult[]> {
  const results = await Promise.all(sites.map((s) => checkSite(s, opts)));
  for (const r of results) await recordResult(store, r); // sequential: rollups are read-modify-write
  const now = (opts.now ?? Date.now)();
  if (new Date(now).getUTCHours() === 3 && new Date(now).getUTCMinutes() < 5) {
    await store.pruneChecks(new Date(now - KEEP_RAW_DAYS * 86_400_000).toISOString());
  }
  return results;
}

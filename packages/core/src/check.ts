import type { CheckResult, Site } from "./types.js";

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface CheckOptions {
  fetch?: FetchLike;
  timeoutMs?: number;
  retryDelayMs?: number;
  now?: () => number;
}

const USER_AGENT = "Pulsetide/1.0 (+https://github.com/naveditachaudhary-pixel/pulsetide)";
const MAX_REDIRECTS = 5;

/**
 * Check one site. A failure is retried once after a short pause, so a single dropped
 * packet doesn't show up as an outage.
 */
export async function checkSite(site: Site, opts: CheckOptions = {}): Promise<CheckResult> {
  const first = await attempt(site, opts);
  if (first.status !== "down") return first;
  await new Promise((r) => setTimeout(r, opts.retryDelayMs ?? 3000));
  return attempt(site, opts);
}

async function attempt(site: Site, opts: CheckOptions): Promise<CheckResult> {
  const fetchFn = opts.fetch ?? fetch;
  const now = opts.now ?? Date.now;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const checkedAt = new Date(now()).toISOString();
  const started = now();
  const result = (status: CheckResult["status"], httpStatus: number | null, reason: string | null, latency: number | null): CheckResult =>
    ({ siteId: site.id, checkedAt, status, latencyMs: latency, httpStatus, reason });

  try {
    const res = await fetchFollowingRedirects(site.url, fetchFn, AbortSignal.timeout(timeoutMs));
    const body = await res.text();
    const latency = Math.round(now() - started);
    if (res.status >= 400) return result("down", res.status, `HTTP ${res.status}`, latency);
    if (site.expect && !body.includes(site.expect)) return result("down", res.status, `Page loaded but "${site.expect}" was missing`, latency);
    if (latency >= (site.slowMs ?? 2500)) return result("degraded", res.status, `Slow response (${(latency / 1000).toFixed(1)} s)`, latency);
    return result("up", res.status, null, latency);
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return result("down", null, timedOut ? `No response within ${timeoutMs / 1000} s` : describe(err), null);
  }
}

/** Follow redirects by hand so cookies set along the way are sent back (some hosts need that). */
async function fetchFollowingRedirects(url: string, fetchFn: FetchLike, signal: AbortSignal): Promise<Response> {
  const cookies = new Map<string, string>();
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const headers: Record<string, string> = { "user-agent": USER_AGENT, accept: "text/html,*/*" };
    if (cookies.size) headers.cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    const res = await fetchFn(current, { redirect: "manual", headers, signal });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(";");
      const eq = pair?.indexOf("=") ?? -1;
      if (pair && eq > 0) cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      current = new URL(location, current).toString();
      continue;
    }
    return res;
  }
  throw new Error(`More than ${MAX_REDIRECTS} redirects`);
}

function describe(err: unknown): string {
  if (err instanceof Error) {
    const cause = (err as Error & { cause?: { code?: string } }).cause;
    if (cause?.code === "ENOTFOUND") return "Domain not found";
    if (cause?.code === "ECONNREFUSED") return "Connection refused";
    if (cause?.code?.startsWith("CERT_") || cause?.code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE") return "Certificate problem";
    return err.message || "Request failed";
  }
  return "Request failed";
}

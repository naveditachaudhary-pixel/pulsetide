export type Status = "up" | "degraded" | "down";

export interface Site {
  id: string;
  name: string;
  url: string;
  /** Text the page must contain. Catches a "successful" response that is really an error page. */
  expect?: string;
  /** Shown on the dashboard next to the site, e.g. a caveat about how it is hosted. */
  note?: string;
  /** Responses slower than this count as degraded (default 2500 ms). */
  slowMs?: number;
}

export interface CheckResult {
  siteId: string;
  checkedAt: string; // ISO time
  status: Status;
  latencyMs: number | null; // null when there was no response at all
  httpStatus: number | null;
  reason: string | null; // why it isn't "up", in plain words
}

export interface DailyRollup {
  siteId: string;
  date: string; // YYYY-MM-DD (UTC)
  up: number;
  degraded: number;
  down: number;
  latencySum: number;
  latencyCount: number;
}

export interface Incident {
  siteId: string;
  id: string;
  start: string;
  end: string | null; // null while still ongoing
  cause: string;
}

export interface SiteState {
  siteId: string;
  status: Status;
  checkedAt: string;
  latencyMs: number | null;
  reason: string | null;
  openIncidentId: string | null;
}

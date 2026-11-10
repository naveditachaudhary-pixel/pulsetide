// The API response, mirrored from packages/core/src/summary.ts (kept separate so the web build has no server code).
export type Status = "up" | "degraded" | "down";
export interface DayBar { date: string; uptime: number | null; avgLatencyMs: number | null; down: number }
export interface LatencyPoint { t: string; ms: number | null; status: Status }
export interface SiteSummary {
  id: string; name: string; url: string; note: string | null;
  status: Status | "unknown"; checkedAt: string | null; latencyMs: number | null; reason: string | null;
  uptime: { d1: number | null; d7: number | null; d30: number | null; d90: number | null };
  days: DayBar[]; latency24h: LatencyPoint[];
}
export interface IncidentSummary { siteId: string; id: string; siteName: string; start: string; end: string | null; cause: string; durationMin: number | null }
export interface StatusPayload {
  generatedAt: string; sample?: boolean;
  overall: { status: "operational" | "degraded" | "partial" | "major" | "unknown"; label: string };
  sites: SiteSummary[]; incidents: IncidentSummary[];
}

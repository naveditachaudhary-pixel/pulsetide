import { TableClient, odata, type TableEntityResult } from "@azure/data-tables";
import type { CheckResult, DailyRollup, Incident, SiteState } from "./types.js";

/** Everything Pulsetide stores. One implementation talks to Azure Table Storage, one lives in memory for tests. */
export interface Store {
  addCheck(c: CheckResult): Promise<void>;
  listChecks(siteId: string, sinceIso: string): Promise<CheckResult[]>; // oldest first
  getDaily(siteId: string, date: string): Promise<DailyRollup | null>;
  putDaily(d: DailyRollup): Promise<void>;
  listDaily(siteId: string, fromDate: string): Promise<DailyRollup[]>; // oldest first
  putIncident(i: Incident): Promise<void>;
  listIncidents(sinceIso: string): Promise<Incident[]>; // newest first
  getState(siteId: string): Promise<SiteState | null>;
  putState(s: SiteState): Promise<void>;
  listStates(): Promise<SiteState[]>;
  pruneChecks(beforeIso: string): Promise<number>;
}

/* ---------------- in memory ---------------- */

export class MemoryStore implements Store {
  checks: CheckResult[] = [];
  daily = new Map<string, DailyRollup>();
  incidents = new Map<string, Incident>();
  states = new Map<string, SiteState>();

  async addCheck(c: CheckResult) { this.checks.push({ ...c }); }
  async listChecks(siteId: string, sinceIso: string) {
    return this.checks.filter((c) => c.siteId === siteId && c.checkedAt >= sinceIso).sort((a, b) => a.checkedAt.localeCompare(b.checkedAt));
  }
  async getDaily(siteId: string, date: string) { const d = this.daily.get(`${siteId}|${date}`); return d ? { ...d } : null; }
  async putDaily(d: DailyRollup) { this.daily.set(`${d.siteId}|${d.date}`, { ...d }); }
  async listDaily(siteId: string, fromDate: string) {
    return [...this.daily.values()].filter((d) => d.siteId === siteId && d.date >= fromDate).sort((a, b) => a.date.localeCompare(b.date));
  }
  async putIncident(i: Incident) { this.incidents.set(`${i.siteId}|${i.id}`, { ...i }); }
  async listIncidents(sinceIso: string) {
    return [...this.incidents.values()].filter((i) => (i.end ?? "9999") >= sinceIso).sort((a, b) => b.start.localeCompare(a.start));
  }
  async getState(siteId: string) { const s = this.states.get(siteId); return s ? { ...s } : null; }
  async putState(s: SiteState) { this.states.set(s.siteId, { ...s }); }
  async listStates() { return [...this.states.values()]; }
  async pruneChecks(beforeIso: string) {
    const before = this.checks.length;
    this.checks = this.checks.filter((c) => c.checkedAt >= beforeIso);
    return before - this.checks.length;
  }
}

/* ---------------- Azure Table Storage ---------------- */

/**
 * Four tables: raw checks (kept 30 days), daily rollups (kept for good, tiny), incidents, and the
 * latest state per site. Check row keys are "inverted" timestamps so the newest sort first.
 */
export class TableStore implements Store {
  private constructor(
    private checks: TableClient,
    private daily: TableClient,
    private incidents: TableClient,
    private state: TableClient,
  ) {}

  static async connect(connectionString: string, prefix = "pulsetide"): Promise<TableStore> {
    const opts = { allowInsecureConnection: connectionString.includes("UseDevelopmentStorage") || connectionString.includes("127.0.0.1") };
    const make = (name: string) => TableClient.fromConnectionString(connectionString, `${prefix}${name}`, opts);
    const store = new TableStore(make("checks"), make("daily"), make("incidents"), make("state"));
    await Promise.all([store.checks, store.daily, store.incidents, store.state].map((t) => t.createTable()));
    return store;
  }

  async addCheck(c: CheckResult) {
    await this.checks.upsertEntity({ partitionKey: c.siteId, rowKey: invert(c.checkedAt), ...clean(c) }, "Replace");
  }

  async listChecks(siteId: string, sinceIso: string) {
    const out: CheckResult[] = [];
    const filter = odata`PartitionKey eq ${siteId} and RowKey le ${invert(sinceIso)}`;
    for await (const e of this.checks.listEntities<Record<string, unknown>>({ queryOptions: { filter } })) out.push(toCheck(e));
    return out.reverse();
  }

  async getDaily(siteId: string, date: string) {
    try { return toDaily(await this.daily.getEntity<Record<string, unknown>>(siteId, date)); }
    catch (e) { if (isNotFound(e)) return null; throw e; }
  }

  async putDaily(d: DailyRollup) {
    await this.daily.upsertEntity({ partitionKey: d.siteId, rowKey: d.date, ...d }, "Replace");
  }

  async listDaily(siteId: string, fromDate: string) {
    const out: DailyRollup[] = [];
    const filter = odata`PartitionKey eq ${siteId} and RowKey ge ${fromDate}`;
    for await (const e of this.daily.listEntities<Record<string, unknown>>({ queryOptions: { filter } })) out.push(toDaily(e));
    return out;
  }

  async putIncident(i: Incident) {
    await this.incidents.upsertEntity({ partitionKey: i.siteId, rowKey: i.id, ...clean(i) }, "Replace");
  }

  async listIncidents(sinceIso: string) {
    const out: Incident[] = [];
    // Few incidents, so read them all and filter here (open incidents have no end time to filter on).
    for await (const e of this.incidents.listEntities<Record<string, unknown>>()) {
      const inc = toIncident(e);
      if ((inc.end ?? "9999") >= sinceIso) out.push(inc);
    }
    return out.sort((a, b) => b.start.localeCompare(a.start));
  }

  async getState(siteId: string) {
    try { return toState(await this.state.getEntity<Record<string, unknown>>("site", siteId)); }
    catch (e) { if (isNotFound(e)) return null; throw e; }
  }

  async putState(s: SiteState) {
    await this.state.upsertEntity({ partitionKey: "site", rowKey: s.siteId, ...clean(s) }, "Replace");
  }

  async listStates() {
    const out: SiteState[] = [];
    for await (const e of this.state.listEntities<Record<string, unknown>>()) out.push(toState(e));
    return out;
  }

  async pruneChecks(beforeIso: string) {
    let removed = 0;
    const filter = odata`RowKey gt ${invert(beforeIso)}`;
    for await (const e of this.checks.listEntities({ queryOptions: { filter, select: ["PartitionKey", "RowKey"] } })) {
      await this.checks.deleteEntity(e.partitionKey!, e.rowKey!);
      removed++;
    }
    return removed;
  }
}

const MAX_MS = 9_999_999_999_999;
/** Newer times give smaller keys, so table queries return the newest rows first. */
export function invert(iso: string): string {
  return String(MAX_MS - Date.parse(iso)).padStart(13, "0");
}

/** Table Storage can't hold null; drop those fields and restore them on read. */
function clean<T extends object>(o: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined));
}
const str = (v: unknown) => (typeof v === "string" ? v : null);
const num = (v: unknown) => (typeof v === "number" ? v : null);

function toCheck(e: TableEntityResult<Record<string, unknown>>): CheckResult {
  return { siteId: String(e.siteId), checkedAt: String(e.checkedAt), status: e.status as CheckResult["status"],
           latencyMs: num(e.latencyMs), httpStatus: num(e.httpStatus), reason: str(e.reason) };
}
function toDaily(e: TableEntityResult<Record<string, unknown>>): DailyRollup {
  return { siteId: String(e.siteId), date: String(e.date), up: Number(e.up ?? 0), degraded: Number(e.degraded ?? 0),
           down: Number(e.down ?? 0), latencySum: Number(e.latencySum ?? 0), latencyCount: Number(e.latencyCount ?? 0) };
}
function toIncident(e: TableEntityResult<Record<string, unknown>>): Incident {
  return { siteId: String(e.siteId), id: String(e.id), start: String(e.start), end: str(e.end), cause: String(e.cause ?? "") };
}
function toState(e: TableEntityResult<Record<string, unknown>>): SiteState {
  return { siteId: String(e.siteId), status: e.status as SiteState["status"], checkedAt: String(e.checkedAt),
           latencyMs: num(e.latencyMs), reason: str(e.reason), openIncidentId: str(e.openIncidentId) };
}
function isNotFound(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { statusCode?: number }).statusCode === 404;
}

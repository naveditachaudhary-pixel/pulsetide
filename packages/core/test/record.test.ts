import { describe, expect, it } from "vitest";
import { MemoryStore } from "../src/store.js";
import { recordResult } from "../src/record.js";
import { buildStatus, overallOf, uptimeOf } from "../src/summary.js";
import { parseSites } from "../src/sites.js";
import type { CheckResult, Site } from "../src/types.js";

const sites: Site[] = [{ id: "a", name: "Site A", url: "https://a.test" }, { id: "b", name: "Site B", url: "https://b.test" }];
const at = (min: number) => new Date(Date.UTC(2026, 10, 10, 12, 0) + min * 60_000).toISOString();
const check = (siteId: string, min: number, status: CheckResult["status"], latencyMs: number | null = 100): CheckResult =>
  ({ siteId, checkedAt: at(min), status, latencyMs, httpStatus: status === "down" ? 500 : 200, reason: status === "down" ? "HTTP 500" : null });

describe("recording checks", () => {
  it("opens an incident when a site goes down and closes it when it recovers", async () => {
    const store = new MemoryStore();
    await recordResult(store, check("a", 0, "up"));
    await recordResult(store, check("a", 5, "down", null));
    await recordResult(store, check("a", 10, "down", null));   // still the same incident
    expect([...store.incidents.values()]).toHaveLength(1);
    expect((await store.getState("a"))?.openIncidentId).not.toBeNull();

    await recordResult(store, check("a", 15, "up"));
    const [incident] = [...store.incidents.values()];
    expect(incident).toMatchObject({ start: at(5), end: at(15), cause: "HTTP 500" });
    expect((await store.getState("a"))?.openIncidentId).toBeNull();
  });

  it("keeps a daily rollup of statuses and latency", async () => {
    const store = new MemoryStore();
    await recordResult(store, check("a", 0, "up", 100));
    await recordResult(store, check("a", 5, "degraded", 3000));
    await recordResult(store, check("a", 10, "down", null));
    expect(await store.getDaily("a", "2026-11-10")).toMatchObject({ up: 1, degraded: 1, down: 1, latencySum: 3100, latencyCount: 2 });
  });
});

describe("status summary", () => {
  it("counts degraded as available and only down against uptime", () => {
    expect(uptimeOf([{ up: 2, degraded: 1, down: 1 }])).toBe(0.75);
    expect(uptimeOf([])).toBeNull();
  });

  it("describes the overall status in plain words", () => {
    expect(overallOf(["up", "up"]).label).toBe("All systems operational");
    expect(overallOf(["up", "degraded"]).status).toBe("degraded");
    expect(overallOf(["up", "down"]).label).toBe("1 site is down");
    expect(overallOf(["down", "down"]).status).toBe("major");
    expect(overallOf(["unknown"]).status).toBe("unknown");
  });

  it("builds the dashboard payload with 90 day bars, 24h latency and incidents", async () => {
    const store = new MemoryStore();
    await recordResult(store, check("a", 0, "up", 120));
    await recordResult(store, check("a", 5, "down", null));
    await recordResult(store, check("a", 10, "up", 140));
    const status = await buildStatus(store, sites, Date.parse(at(12)));

    const a = status.sites.find((s) => s.id === "a")!;
    expect(a.status).toBe("up");
    expect(a.days).toHaveLength(90);
    expect(a.days.at(-1)).toMatchObject({ date: "2026-11-10", down: 1, avgLatencyMs: 130 });
    expect(a.uptime.d1).toBeCloseTo(2 / 3);
    expect(a.latency24h.map((p) => p.status)).toEqual(["up", "down", "up"]);

    const b = status.sites.find((s) => s.id === "b")!;
    expect(b).toMatchObject({ status: "unknown", uptime: { d1: null, d90: null } });
    expect(b.days.every((d) => d.uptime === null)).toBe(true);

    expect(status.incidents).toEqual([expect.objectContaining({ siteName: "Site A", durationMin: 5 })]);
    expect(status.overall.status).toBe("operational");  // site b has no data yet, so it doesn't count
  });
});

describe("sites.json validation", () => {
  it("accepts the real config", async () => {
    const raw = (await import("../../../sites.json", { with: { type: "json" } })).default;
    expect(parseSites(raw).length).toBeGreaterThan(0);
  });
  it("rejects common mistakes with a clear message", () => {
    expect(() => parseSites([])).toThrow(/non-empty/);
    expect(() => parseSites([{ id: "Home Page", name: "x", url: "https://x" }])).toThrow(/lowercase/);
    expect(() => parseSites([{ id: "a", name: "x", url: "x.com" }])).toThrow(/http/);
    expect(() => parseSites([{ id: "a", name: "x", url: "https://x" }, { id: "a", name: "y", url: "https://y" }])).toThrow(/duplicate/);
  });
});

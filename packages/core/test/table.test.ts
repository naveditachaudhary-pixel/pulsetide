/**
 * Runs the Azure Table Storage code against Azurite, Microsoft's local storage emulator,
 * so the real queries (inverted keys, filters, null handling) are tested without an Azure account.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TableStore } from "../src/store.js";
import { recordResult } from "../src/record.js";
import { buildStatus } from "../src/summary.js";
import type { CheckResult } from "../src/types.js";

const PORT = 10_102;
// Azurite's well-known development account (public, documented by Microsoft, only works locally).
const CONN = "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;" +
  "AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;" +
  `TableEndpoint=http://127.0.0.1:${PORT}/devstoreaccount1;`;

let azurite: ChildProcess;

beforeAll(async () => {
  const bin = createRequire(import.meta.url).resolve("azurite/dist/src/table/main.js");
  azurite = spawn(process.execPath, [bin, "--inMemoryPersistence", "--tablePort", String(PORT), "--silent", "--skipApiVersionCheck"], { stdio: "ignore" });
  for (let i = 0; i < 50; i++) {
    try { await fetch(`http://127.0.0.1:${PORT}/`); return; } catch { await new Promise((r) => setTimeout(r, 200)); }
  }
  throw new Error("Azurite did not start");
});
afterAll(() => { azurite?.kill(); });

const at = (min: number) => new Date(Date.UTC(2026, 10, 10, 12, 0) + min * 60_000).toISOString();
const check = (siteId: string, min: number, status: CheckResult["status"], latencyMs: number | null = 100): CheckResult =>
  ({ siteId, checkedAt: at(min), status, latencyMs, httpStatus: latencyMs === null ? null : 200, reason: status === "up" ? null : "Connection refused" });

describe("TableStore on Azurite", () => {
  it("stores checks, rollups, incidents and state, and reads them back newest-first where it should", async () => {
    const store = await TableStore.connect(CONN, `t${Date.now()}`);
    await TableStore.connect(CONN, "again"); // creating tables twice is fine
    for (const [min, status] of [[0, "up"], [5, "down"], [10, "down"], [15, "up"]] as const) {
      await recordResult(store, check("site-a", min, status, status === "up" ? 100 + min : null));
    }

    const checks = await store.listChecks("site-a", at(5));
    expect(checks.map((c) => c.checkedAt)).toEqual([at(5), at(10), at(15)]);   // oldest first, filtered by time
    expect(checks[0]).toMatchObject({ latencyMs: null, httpStatus: null, reason: "Connection refused" }); // nulls survive

    expect(await store.getDaily("site-a", "2026-11-10")).toMatchObject({ up: 2, down: 2, latencySum: 215, latencyCount: 2 });
    expect(await store.getDaily("site-a", "2020-01-01")).toBeNull();

    const incidents = await store.listIncidents(at(0));
    expect(incidents).toEqual([expect.objectContaining({ siteId: "site-a", start: at(5), end: at(15) })]);
    expect(await store.getState("site-a")).toMatchObject({ status: "up", openIncidentId: null });

    const status = await buildStatus(store, [{ id: "site-a", name: "A", url: "https://a.test" }], Date.parse(at(20)));
    expect(status.sites[0]).toMatchObject({ status: "up", latencyMs: 115 });
    expect(status.incidents[0]).toMatchObject({ durationMin: 10 });

    expect(await store.pruneChecks(at(6))).toBe(2);                            // removes the two before 12:06
    expect((await store.listChecks("site-a", at(0))).map((c) => c.checkedAt)).toEqual([at(10), at(15)]);
  });
});

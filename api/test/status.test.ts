import { describe, expect, it } from "vitest";
import { InvocationContext, HttpRequest } from "@azure/functions";
import { MemoryStore, recordResult } from "@pulsetide/core";
import { createStatusHandler } from "../src/status.js";

const sites = [{ id: "a", name: "Site A", url: "https://a.test" }];
const req = new HttpRequest({ method: "GET", url: "https://pulsetide.test/api/status" });
const ctx = () => new InvocationContext({ functionName: "status" });

describe("GET /api/status", () => {
  it("returns the dashboard payload, cached for a minute", async () => {
    const store = new MemoryStore();
    await recordResult(store, { siteId: "a", checkedAt: new Date().toISOString(), status: "up", latencyMs: 90, httpStatus: 200, reason: null });
    const res = await createStatusHandler(async () => store, sites)(req, ctx());
    expect(res.status).toBe(200);
    expect(res.headers).toMatchObject({ "cache-control": "public, max-age=60" });
    expect(res.jsonBody).toMatchObject({ overall: { status: "operational" }, sites: [{ id: "a", status: "up", latencyMs: 90 }] });
  });

  it("explains a missing storage setting with 503 instead of crashing", async () => {
    const res = await createStatusHandler(() => Promise.reject(new Error("PULSETIDE_STORAGE is not set")), sites)(req, ctx());
    expect(res.status).toBe(503);
    expect(res.jsonBody).toEqual({ error: "The status service isn't configured yet." });
  });

  it("returns a generic 500 if storage fails mid-request", async () => {
    const broken = Object.assign(new MemoryStore(), { listStates: () => Promise.reject(new Error("boom")) });
    const res = await createStatusHandler(async () => broken, sites)(req, ctx());
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.jsonBody)).not.toContain("boom"); // internal errors aren't leaked
  });
});

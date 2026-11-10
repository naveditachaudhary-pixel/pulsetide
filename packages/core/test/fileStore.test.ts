import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FileStore, runToFolder } from "../src/fileStore.js";
import type { StatusPayload } from "../src/summary.js";

const sites = [{ id: "ok", name: "OK", url: "https://ok.test" }, { id: "bad", name: "Bad", url: "https://bad.test" }];
const fetch = async (url: string) => (url === "https://ok.test" ? new Response("hi") : new Response("err", { status: 500 }));

describe("running without a database", () => {
  it("keeps history across runs in a folder and writes status.json for the dashboard", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pulsetide-"));
    let t = Date.UTC(2026, 10, 10, 12, 0);
    const opts = { fetch, retryDelayMs: 0, now: () => t };

    await runToFolder(dir, sites, opts);
    t += 5 * 60_000;
    await runToFolder(dir, sites, opts);   // second run must see the first run's data

    const store = await FileStore.load(dir);
    expect(store.checks).toHaveLength(4);
    expect(store.incidents.size).toBe(1);   // one ongoing incident, not two
    expect(await store.getDaily("ok", "2026-11-10")).toMatchObject({ up: 2 });

    const status = JSON.parse(await readFile(join(dir, "status.json"), "utf8")) as StatusPayload;
    expect(status.overall.label).toBe("1 site is down");
    expect(status.sites.map((s) => s.status)).toEqual(["up", "down"]);
    expect(status.sample).toBeUndefined();
  });

  it("trims raw checks to the last day so the data branch stays small", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pulsetide-"));
    let t = Date.UTC(2026, 10, 10, 0, 0);
    const opts = { fetch, retryDelayMs: 0, now: () => t };
    await runToFolder(dir, sites, opts);
    t += 30 * 3_600_000;                     // 30 hours later
    await runToFolder(dir, sites, opts);
    const store = await FileStore.load(dir);
    expect(store.checks.every((c) => c.checkedAt >= "2026-11-11")).toBe(true);
    expect(store.daily.size).toBe(4);       // daily rollups are kept
  });
});

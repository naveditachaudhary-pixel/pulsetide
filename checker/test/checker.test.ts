import { describe, expect, it, vi } from "vitest";
import { InvocationContext } from "@azure/functions";
import { MemoryStore } from "@pulsetide/core";
import { createChecker } from "../src/checker.js";

describe("timer job", () => {
  it("checks every site, records the results and logs a line per site", async () => {
    const store = new MemoryStore();
    const sites = [{ id: "ok", name: "OK", url: "https://ok.test" }, { id: "broken", name: "Broken", url: "https://broken.test" }];
    const fetch = async (url: string) => (url === "https://ok.test" ? new Response("hi") : new Response("err", { status: 500 }));
    const context = new InvocationContext({ functionName: "check-sites" });
    const log = vi.spyOn(context, "log").mockImplementation(() => {});
    const warn = vi.spyOn(context, "warn").mockImplementation(() => {});

    await createChecker(async () => store, sites, { fetch, retryDelayMs: 0 })({ isPastDue: false } as never, context);

    expect((await store.getState("ok"))?.status).toBe("up");
    expect((await store.getState("broken"))?.status).toBe("down");
    expect(store.incidents.size).toBe(1);
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^ok: up in \d+ ms$/));
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^broken: down in \d+ ms \(HTTP 500\)$/));
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { App } from "./App";
import type { StatusPayload } from "./types";

const days = Array.from({ length: 90 }, (_, i) => ({ date: `2026-08-${String((i % 28) + 1).padStart(2, "0")}`, uptime: i === 89 ? 0.9 : 1, avgLatencyMs: 120, down: i === 89 ? 3 : 0 }));
const payload: StatusPayload = {
  generatedAt: new Date().toISOString(),
  overall: { status: "partial", label: "1 site is down" },
  sites: [
    { id: "a", name: "Portfolio", url: "https://a.test", note: null, status: "up", checkedAt: new Date().toISOString(), latencyMs: 140, reason: null,
      uptime: { d1: 1, d7: 1, d30: 0.9991, d90: 0.9995 }, days, latency24h: [] },
    { id: "b", name: "Demo", url: "https://b.test", note: "Sleeps when idle.", status: "down", checkedAt: new Date().toISOString(), latencyMs: null, reason: "HTTP 503",
      uptime: { d1: 0.5, d7: null, d30: null, d90: null }, days, latency24h: [] },
  ],
  incidents: [{ siteId: "b", id: "1", siteName: "Demo", start: new Date().toISOString(), end: null, cause: "HTTP 503", durationMin: null }],
};

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const serve = (status: number, body: unknown) =>
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })));

describe("dashboard", () => {
  it("shows the overall status, every site and open incidents", async () => {
    serve(200, payload);
    render(<App />);
    expect(await screen.findByText("1 site is down")).toBeTruthy();
    expect(screen.getByText("Operational")).toBeTruthy();
    expect(screen.getByText("Down")).toBeTruthy();
    expect(screen.getByText(/HTTP 503 · checked/)).toBeTruthy();
    expect(screen.getByText("Sleeps when idle.")).toBeTruthy();
    expect(screen.getByText("Ongoing")).toBeTruthy();
    expect(screen.getByText("99.91%")).toBeTruthy();        // rounds down, never overstates uptime
    expect(screen.queryByText(/Sample data/)).toBeNull();     // real data has no sample banner
  });

  it("labels sample data", async () => {
    serve(200, { ...payload, sample: true });
    render(<App />);
    expect(await screen.findByText(/Sample data for local preview/)).toBeTruthy();
  });

  it("explains API errors and offers a retry", async () => {
    serve(503, { error: "The status service isn't configured yet." });
    render(<App />);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("isn't configured yet"));
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });
});

describe("formatting", () => {
  it("never rounds uptime up", async () => {
    const { pct } = await import("./format");
    expect(pct(0.99996)).toBe("99.99%");
    expect(pct(1)).toBe("100%");
    expect(pct(null)).toBe("–");
  });
});

describe("hosted on GitHub", () => {
  it("asks for a fresh copy of status.json every time, so a CDN can't serve an old one", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_HOSTING", "github");
    vi.stubEnv("VITE_STATUS_URL", "https://raw.example.test/status.json");
    const fetchMock = vi.fn(async (_url: string) => new Response(JSON.stringify(payload), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { App: GitHubApp } = await import("./App");
    render(<GitHubApp />);
    await screen.findByText("1 site is down");
    expect(String(fetchMock.mock.calls[0]![0])).toMatch(/^https:\/\/raw\.example\.test\/status\.json\?t=\d+$/);
    vi.unstubAllEnvs();
  });
});

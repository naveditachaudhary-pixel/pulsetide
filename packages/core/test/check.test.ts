import { describe, expect, it } from "vitest";
import { checkSite, type FetchLike } from "../src/check.js";
import type { Site } from "../src/types.js";

const site: Site = { id: "home", name: "Home", url: "https://example.com/", expect: "Welcome" };

function fakeFetch(routes: Record<string, () => Response | Promise<Response>>, log: { url: string; init: RequestInit }[] = []): FetchLike {
  return async (url, init) => {
    log.push({ url, init });
    const route = routes[url];
    if (!route) throw new Error(`unexpected ${url}`);
    return route();
  };
}
let clock = 0;
const opts = (fetch: FetchLike, latency = 100) => ({ fetch, retryDelayMs: 0, now: () => (clock += latency) });

describe("checkSite", () => {
  it("reports up with latency when the page loads and has the expected text", async () => {
    const r = await checkSite(site, opts(fakeFetch({ "https://example.com/": () => new Response("<h1>Welcome</h1>") })));
    expect(r).toMatchObject({ siteId: "home", status: "up", httpStatus: 200, reason: null, latencyMs: 100 });
  });

  it("reports down for HTTP errors", async () => {
    const r = await checkSite(site, opts(fakeFetch({ "https://example.com/": () => new Response("nope", { status: 503 }) })));
    expect(r).toMatchObject({ status: "down", httpStatus: 503, reason: "HTTP 503" });
  });

  it("reports down when the expected text is missing (an error page served with 200)", async () => {
    const r = await checkSite(site, opts(fakeFetch({ "https://example.com/": () => new Response("Site not found") })));
    expect(r.status).toBe("down");
    expect(r.reason).toContain('"Welcome" was missing');
  });

  it("reports degraded when the response is slow", async () => {
    const r = await checkSite(site, opts(fakeFetch({ "https://example.com/": () => new Response("Welcome") }), 3200));
    expect(r).toMatchObject({ status: "degraded", reason: "Slow response (3.2 s)" });
  });

  it("follows redirects and sends cookies set along the way", async () => {
    const log: { url: string; init: RequestInit }[] = [];
    const fetch = fakeFetch({
      "https://example.com/": () => new Response(null, { status: 303, headers: [["location", "/auth"], ["set-cookie", "session=abc; Path=/"]] }),
      "https://example.com/auth": () => new Response(null, { status: 302, headers: { location: "https://example.com/home" } }),
      "https://example.com/home": () => new Response("Welcome back"),
    }, log);
    const r = await checkSite(site, opts(fetch));
    expect(r.status).toBe("up");
    expect(log.map((l) => l.url)).toEqual(["https://example.com/", "https://example.com/auth", "https://example.com/home"]);
    expect((log[1]!.init.headers as Record<string, string>).cookie).toBe("session=abc");
  });

  it("retries once before calling a site down", async () => {
    let calls = 0;
    const fetch: FetchLike = async () => (++calls === 1 ? Promise.reject(new TypeError("fetch failed")) : new Response("Welcome"));
    const r = await checkSite(site, opts(fetch));
    expect(calls).toBe(2);
    expect(r.status).toBe("up");
  });

  it("explains network failures in plain words", async () => {
    const err = Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } });
    const r = await checkSite(site, opts(async () => { throw err; }));
    expect(r).toMatchObject({ status: "down", reason: "Domain not found", latencyMs: null, httpStatus: null });
  });

  it("times out slow servers", async () => {
    const hang: FetchLike = (_url, init) => new Promise((_, reject) =>
      init.signal!.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "TimeoutError" }))));
    const r = await checkSite(site, { fetch: hang, retryDelayMs: 0, timeoutMs: 50 });
    expect(r).toMatchObject({ status: "down", reason: "No response within 0.05 s" });
  });
});

describe("cookies across redirects", () => {
  it("handles Streamlit Cloud's redirect: a deletion cookie is not sent on to the next host", async () => {
    const log: { url: string; init: RequestInit }[] = [];
    const app = "https://demo.streamlit.app/";
    const auth = "https://share.streamlit.io/-/auth/app?redirect_uri=https%3A%2F%2Fdemo.streamlit.app%2F";
    const fetch = fakeFetch({
      [app]: () => (log.length === 1
        ? new Response(null, { status: 303, headers: [["location", auth], ["set-cookie", "streamlit_session=; Path=/; Max-Age=0"]] })
        : new Response("<html>streamlit</html>")),
      [auth]: () => {
        const sent = (log.at(-1)!.init.headers as Record<string, string>).cookie;
        return sent ? new Response("not found", { status: 404 }) : new Response(null, { status: 303, headers: [["location", app], ["set-cookie", "app_token=xyz; Path=/"]] });
      },
    }, log);
    const r = await checkSite({ id: "s", name: "S", url: app }, opts(fetch));
    expect(r.status).toBe("up");
    expect((log[1]!.init.headers as Record<string, string>).cookie).toBeUndefined();   // nothing sent to share.streamlit.io
    expect((log[2]!.init.headers as Record<string, string>).cookie).toBeUndefined();   // share.streamlit.io's cookie isn't sent to the app
  });
});

describe("CookieJar", async () => {
  const { CookieJar } = await import("../src/check.js");

  it("only sends cookies back to the host that set them", () => {
    const jar = new CookieJar();
    jar.store("a=1; Path=/", "https://one.test/x");
    expect(jar.headerFor("https://one.test/")).toBe("a=1");
    expect(jar.headerFor("https://two.test/")).toBe("");
    expect(jar.headerFor("https://sub.one.test/")).toBe("");      // host-only by default
  });

  it("honours Domain for subdomains, but not for unrelated sites", () => {
    const jar = new CookieJar();
    jar.store("a=1; Domain=.example.com", "https://www.example.com/");
    jar.store("evil=1; Domain=other.com", "https://www.example.com/");
    expect(jar.headerFor("https://api.example.com/")).toBe("a=1");
    expect(jar.headerFor("https://other.com/")).toBe("");
  });

  it("deletes a cookie on Max-Age=0 or a past Expires date", () => {
    const jar = new CookieJar();
    jar.store("a=1", "https://one.test/");
    jar.store("b=2", "https://one.test/");
    jar.store("a=; Max-Age=0", "https://one.test/");
    jar.store("b=; Expires=Thu, 01 Jan 1970 00:00:00 GMT", "https://one.test/");
    jar.store("c=; Max-Age=0", "https://one.test/");                // deleting an unknown cookie stores nothing
    expect(jar.headerFor("https://one.test/")).toBe("");
  });

  it("respects Path", () => {
    const jar = new CookieJar();
    jar.store("a=1; Path=/app", "https://one.test/app/x");
    expect(jar.headerFor("https://one.test/app/page")).toBe("a=1");
    expect(jar.headerFor("https://one.test/other")).toBe("");
  });
});

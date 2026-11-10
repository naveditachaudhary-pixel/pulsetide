import { useCallback, useEffect, useState } from "react";
import type { StatusPayload } from "./types";
import { ago } from "./format";
import { SiteCard } from "./SiteCard";
import { Incidents } from "./Incidents";

const REFRESH_MS = 60_000;
const REPO = "https://github.com/naveditachaudhary-pixel/pulsetide";
// Where the status comes from: the Azure API by default, or a JSON file when hosted on GitHub.
const STATUS_URL = import.meta.env.VITE_STATUS_URL || "/api/status";
const ON_GITHUB = import.meta.env.VITE_HOSTING === "github";

export function App() {
  const [data, setData] = useState<StatusPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, tick] = useState(0);

  const load = useCallback(async () => {
    try {
      // On GitHub the file is served through a CDN that caches each copy for up to 5 minutes, and its
      // edge servers don't all update together. A unique query string always gets the latest version.
      const url = ON_GITHUB ? `${STATUS_URL}${STATUS_URL.includes("?") ? "&" : "?"}t=${Date.now()}` : STATUS_URL;
      const res = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? `The status service answered ${res.status}.`);
      setData(body as StatusPayload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load the status.");
    }
  }, []);

  useEffect(() => {
    load();
    const refresh = setInterval(load, REFRESH_MS);
    const clock = setInterval(() => tick((n) => n + 1), 15_000); // keeps "updated x min ago" fresh
    return () => { clearInterval(refresh); clearInterval(clock); };
  }, [load]);

  const lastChecked = data?.sites.map((s) => s.checkedAt).filter(Boolean).sort().at(-1) ?? null;

  return (
    <div className="wrap">
      <header className="top">
        <div>
          <p className="eyebrow">Pulsetide</p>
          <h1>Status <em>of my projects</em></h1>
          <p className="lede">Live uptime and response times for the demos in my portfolio, checked {ON_GITHUB ? "about every 5 minutes by a scheduled GitHub Actions job" : "every 5 minutes from Azure"}.</p>
        </div>
        <nav className="links">
          <a className="pill" href="https://naveditachaudhary-pixel.github.io/" target="_blank" rel="noopener">Portfolio ↗</a>
          <a className="pill" href={REPO} target="_blank" rel="noopener">Code on GitHub ↗</a>
        </nav>
      </header>

      {data?.sample && (
        <p className="sample" role="note">Sample data for local preview. The deployed page shows real checks.</p>
      )}

      {!data && !error && <div className="banner loading" aria-busy="true"><span className="dot" />Loading status…</div>}

      {error && (
        <div className="banner error" role="alert">
          <span className="dot" />
          <span>{error} {data ? "Showing the last known status." : ""}</span>
          <button onClick={load}>Try again</button>
        </div>
      )}

      {data && (
        <>
          <div className={`banner ${data.overall.status}`} role="status">
            <span className="dot" />
            <strong>{data.overall.label}</strong>
            <span className="muted">Last check {ago(lastChecked)}</span>
          </div>

          <section aria-label="Sites" className="sites">
            {data.sites.map((s) => <SiteCard key={s.id} site={s} />)}
          </section>

          <Incidents incidents={data.incidents} />
        </>
      )}

      <footer>
        <span>{ON_GITHUB ? "Built with React and TypeScript. Checks run on GitHub Actions; the same code also deploys to Azure Functions." : "Built with React, TypeScript, Azure Functions, Table Storage and Static Web Apps."}</span>
        <span>© 2026 Navedita Chaudhary</span>
      </footer>
    </div>
  );
}

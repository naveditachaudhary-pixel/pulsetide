import { useState } from "react";
import type { SiteSummary } from "./types";
import { ago, band, day, ms, pct } from "./format";
import { Sparkline } from "./Sparkline";

const LABEL = { up: "Operational", degraded: "Slow", down: "Down", unknown: "No data yet" } as const;

export function SiteCard({ site }: { site: SiteSummary }) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover !== null ? site.days[hover] : null;

  return (
    <article className="card">
      <div className="card-head">
        <h2><a href={site.url} target="_blank" rel="noopener">{site.name} <span aria-hidden="true">↗</span></a></h2>
        <span className={`status ${site.status}`}><span className="dot" />{LABEL[site.status]}</span>
      </div>

      <dl className="stats">
        <div><dt>Response</dt><dd>{ms(site.latencyMs)}</dd></div>
        <div><dt>Uptime 24 h</dt><dd>{pct(site.uptime.d1)}</dd></div>
        <div><dt>Uptime 30 d</dt><dd>{pct(site.uptime.d30)}</dd></div>
        <div><dt>Uptime 90 d</dt><dd>{pct(site.uptime.d90)}</dd></div>
      </dl>
      {site.reason && site.status !== "up" && <p className="reason">{site.reason} · checked {ago(site.checkedAt)}</p>}

      <div className="bars" onMouseLeave={() => setHover(null)} role="img"
           aria-label={`Daily uptime for the last 90 days: ${pct(site.uptime.d90)} overall`}>
        {site.days.map((d, i) => (
          <span key={d.date} className={`bar ${band(d.uptime)}`} onMouseEnter={() => setHover(i)}
                title={`${day(d.date)}: ${d.uptime === null ? "no data" : pct(d.uptime)}`} />
        ))}
      </div>
      <div className="bar-legend">
        {shown ? (
          <span className="tip">
            <b>{day(shown.date)}</b> · {shown.uptime === null ? "No data" : `${pct(shown.uptime)} up`}
            {shown.avgLatencyMs !== null && ` · avg ${ms(shown.avgLatencyMs)}`}
            {shown.down > 0 && ` · ${shown.down} failed check${shown.down > 1 ? "s" : ""}`}
          </span>
        ) : (<><span>90 days ago</span><span>Today</span></>)}
      </div>

      <div className="spark">
        <span className="spark-label">Response time, last 24 h</span>
        <Sparkline points={site.latency24h} />
      </div>
      {site.note && <p className="note">{site.note}</p>}
    </article>
  );
}

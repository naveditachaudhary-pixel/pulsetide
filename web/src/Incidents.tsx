import type { IncidentSummary } from "./types";
import { duration, when } from "./format";

export function Incidents({ incidents }: { incidents: IncidentSummary[] }) {
  return (
    <section className="incidents" aria-labelledby="inc-title">
      <h2 id="inc-title">Incidents <em>last 30 days</em></h2>
      {incidents.length === 0 ? (
        <p className="muted">No incidents. Every check in the last 30 days succeeded.</p>
      ) : (
        <ol>
          {incidents.map((i) => (
            <li key={`${i.siteId}-${i.id}`} className={i.end ? "" : "open"}>
              <span className="when">{when(i.start)}</span>
              <span className="what"><b>{i.siteName}</b> · {i.cause}</span>
              <span className="how-long">{duration(i.durationMin)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** Uptime is always rounded down, so 99.996% shows as 99.99%: a status page should never overstate it. */
export const pct = (v: number | null) => (v === null ? "–" : v >= 1 ? "100%" : `${(Math.floor(v * 10000) / 100).toFixed(2)}%`);
export const ms = (v: number | null) => (v === null ? "–" : v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${v} ms`);

export function ago(iso: string | null, now = Date.now()): string {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

export function duration(min: number | null): string {
  if (min === null) return "Ongoing";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export const day = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

/** Bar colour for a day's uptime. */
export function band(uptime: number | null): "none" | "good" | "warn" | "bad" {
  if (uptime === null) return "none";
  if (uptime >= 0.995) return "good";
  if (uptime >= 0.95) return "warn";
  return "bad";
}

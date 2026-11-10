import type { LatencyPoint } from "./types";
import { ms } from "./format";

const W = 600, H = 56, PAD = 3;

/** Response time over the last 24 hours. Gaps are checks with no response; red ticks mark failed checks. */
export function Sparkline({ points }: { points: LatencyPoint[] }) {
  if (points.length < 2) return <p className="spark-empty">Not enough checks yet.</p>;
  const t0 = Date.parse(points[0]!.t), t1 = Date.parse(points.at(-1)!.t) || t0 + 1;
  const values = points.map((p) => p.ms).filter((v): v is number => v !== null);
  const max = Math.max(...values, 1);
  const x = (t: string) => PAD + ((Date.parse(t) - t0) / Math.max(1, t1 - t0)) * (W - 2 * PAD);
  const y = (v: number) => H - PAD - (v / max) * (H - 2 * PAD);

  let d = "", pen = false;
  for (const p of points) {
    if (p.ms === null) { pen = false; continue; }
    d += `${pen ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.ms).toFixed(1)}`;
    pen = true;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? null;

  return (
    <figure className="sparkline">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img"
           aria-label={`Median response ${ms(median)}, slowest ${ms(max)}`}>
        <path d={d} className="line" vectorEffect="non-scaling-stroke" />
        {points.filter((p) => p.status === "down").map((p) => (
          <line key={p.t} x1={x(p.t)} x2={x(p.t)} y1={0} y2={H} className="fail" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <figcaption>median {ms(median)} · max {ms(max)}</figcaption>
    </figure>
  );
}

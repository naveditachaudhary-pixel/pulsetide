// Scheduled run for GitHub Actions: node .deploy/run-checks.mjs <data-folder>
import { parseSites, runToFolder } from "@pulsetide/core";
import rawSites from "../sites.json";

const dir = process.argv[2] ?? "data";
const results = await runToFolder(dir, parseSites(rawSites));
for (const r of results) {
  console.log(`${r.status === "down" ? "✗" : "✓"} ${r.siteId}: ${r.status}${r.latencyMs !== null ? ` in ${r.latencyMs} ms` : ""}${r.reason ? ` (${r.reason})` : ""}`);
}

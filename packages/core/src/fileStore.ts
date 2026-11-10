import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MemoryStore } from "./store.js";
import { buildStatus } from "./summary.js";
import { runChecks } from "./run.js";
import type { CheckOptions } from "./check.js";
import type { CheckResult, Site } from "./types.js";

const FILES = { checks: "checks.json", daily: "daily.json", incidents: "incidents.json", state: "state.json", status: "status.json" };

/**
 * Keeps everything in a folder of JSON files, for running Pulsetide without a database
 * (for example from a scheduled GitHub Actions job that commits the folder to a branch).
 */
export class FileStore extends MemoryStore {
  static async load(dir: string): Promise<FileStore> {
    const store = new FileStore();
    const read = async <T>(file: string, fallback: T): Promise<T> => {
      try { return JSON.parse(await readFile(join(dir, file), "utf8")) as T; }
      catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return fallback; throw e; }
    };
    store.checks = await read(FILES.checks, []);
    for (const d of await read<MemoryStore["daily"] extends Map<string, infer V> ? V[] : never>(FILES.daily, [])) await store.putDaily(d);
    for (const i of await read<MemoryStore["incidents"] extends Map<string, infer V> ? V[] : never>(FILES.incidents, [])) await store.putIncident(i);
    for (const s of await read<MemoryStore["states"] extends Map<string, infer V> ? V[] : never>(FILES.state, [])) await store.putState(s);
    return store;
  }

  async save(dir: string): Promise<void> {
    await mkdir(dir, { recursive: true });
    const write = (file: string, data: unknown) => writeFile(join(dir, file), JSON.stringify(data) + "\n");
    await Promise.all([
      write(FILES.checks, this.checks),
      write(FILES.daily, [...this.daily.values()].sort((a, b) => a.siteId.localeCompare(b.siteId) || a.date.localeCompare(b.date))),
      write(FILES.incidents, [...this.incidents.values()]),
      write(FILES.state, [...this.states.values()]),
    ]);
  }
}

export interface FileRunOptions extends CheckOptions {
  keepRawHours?: number; // raw checks kept in the files; the dashboard only needs the last 24 h
  keepDays?: number;     // daily rollups and closed incidents older than this are dropped
}

/**
 * One scheduled run without a database: load the folder, check every site, trim old data,
 * and write the folder back with a ready-to-serve status.json for the dashboard.
 */
export async function runToFolder(dir: string, sites: Site[], opts: FileRunOptions = {}): Promise<CheckResult[]> {
  const nowMs = (opts.now ?? Date.now)();
  const store = await FileStore.load(dir);
  const results = await runChecks(store, sites, opts);

  await store.pruneChecks(new Date(nowMs - (opts.keepRawHours ?? 25) * 3_600_000).toISOString());
  const cutoff = new Date(nowMs - (opts.keepDays ?? 400) * 86_400_000).toISOString();
  for (const [key, d] of store.daily) if (d.date < cutoff.slice(0, 10)) store.daily.delete(key);
  for (const [key, i] of store.incidents) if (i.end && i.end < cutoff) store.incidents.delete(key);

  await store.save(dir);
  await writeFile(join(dir, FILES.status), JSON.stringify(await buildStatus(store, sites, nowMs)) + "\n");
  return results;
}

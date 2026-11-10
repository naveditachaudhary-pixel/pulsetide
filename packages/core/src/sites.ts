import type { Site } from "./types.js";

/** Validate the sites list so a typo fails loudly at deploy time instead of silently at 3 a.m. */
export function parseSites(raw: unknown): Site[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new Error("sites.json must be a non-empty array");
  const seen = new Set<string>();
  return raw.map((s, i) => {
    const where = `sites.json entry ${i + 1}`;
    if (typeof s !== "object" || s === null) throw new Error(`${where} must be an object`);
    const { id, name, url, expect, note, slowMs } = s as Record<string, unknown>;
    if (typeof id !== "string" || !/^[a-z0-9-]+$/.test(id)) throw new Error(`${where}: "id" must be lowercase letters, digits or dashes`);
    if (seen.has(id)) throw new Error(`${where}: duplicate id "${id}"`);
    seen.add(id);
    if (typeof name !== "string" || !name.trim()) throw new Error(`${where}: "name" is required`);
    if (typeof url !== "string" || !/^https?:\/\//.test(url)) throw new Error(`${where}: "url" must start with http:// or https://`);
    if (expect !== undefined && typeof expect !== "string") throw new Error(`${where}: "expect" must be text`);
    if (note !== undefined && typeof note !== "string") throw new Error(`${where}: "note" must be text`);
    if (slowMs !== undefined && (typeof slowMs !== "number" || slowMs <= 0)) throw new Error(`${where}: "slowMs" must be a positive number`);
    return { id, name, url, expect, note, slowMs } as Site;
  });
}

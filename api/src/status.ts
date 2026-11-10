import type { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { buildStatus, type Site, type Store } from "@pulsetide/core";

/** GET /api/status: everything the dashboard shows, in one response, cached for a minute. */
export function createStatusHandler(getStore: () => Promise<Store>, sites: Site[]) {
  return async (_req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    let store: Store;
    try {
      store = await getStore();
    } catch (err) {
      context.error("Storage is not configured", err);
      return { status: 503, jsonBody: { error: "The status service isn't configured yet." }, headers: { "cache-control": "no-store" } };
    }
    try {
      return { status: 200, jsonBody: await buildStatus(store, sites), headers: { "cache-control": "public, max-age=60" } };
    } catch (err) {
      context.error("Failed to build status", err);
      return { status: 500, jsonBody: { error: "Couldn't load the status right now." }, headers: { "cache-control": "no-store" } };
    }
  };
}

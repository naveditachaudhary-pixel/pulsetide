import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Local preview only: serves /api/status from made-up history so the dashboard can be worked on
 * without Azure. The response is flagged as sample data and the page shows a banner saying so.
 * Production builds don't include any of this.
 */
function sampleApi(): Plugin {
  return {
    name: "pulsetide-sample-api",
    apply: "serve",
    async configureServer(server) {
      const core = await server.ssrLoadModule("@pulsetide/core");
      const sites = core.parseSites((await import("../sites.json", { with: { type: "json" } })).default);
      const store = new core.MemoryStore();
      await core.simulateHistory(store, sites);
      server.middlewares.use("/api/status", async (_req, res) => {
        const payload = { ...(await core.buildStatus(store, sites)), sample: true };
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(payload));
      });
    },
  };
}

export default defineConfig({ plugins: [react(), sampleApi()] });

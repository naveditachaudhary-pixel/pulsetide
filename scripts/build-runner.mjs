// Bundles scripts/run-checks.ts into one file the scheduled workflow can run with plain Node.
import { build } from "esbuild";
await build({
  entryPoints: ["scripts/run-checks.ts"], outfile: ".deploy/run-checks.mjs",
  bundle: true, platform: "node", target: "node22", format: "esm", logLevel: "warning",
  banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
});
console.log("Built .deploy/run-checks.mjs");

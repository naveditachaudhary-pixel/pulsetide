// Bundles a function app (checker or api) into .deploy/<name>, ready to upload to Azure:
// the code and its dependencies in one file, plus host.json and the Azure Functions library.
import { build } from "esbuild";
import { execSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const name = process.argv[2];
if (!["checker", "api"].includes(name)) throw new Error("usage: package-function.mjs <checker|api>");

const out = join(root, ".deploy", name);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

await build({
  entryPoints: [join(root, name, "src", "index.ts")],
  outfile: join(out, "dist", "index.js"),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  external: ["@azure/functions"], // provided as a normal dependency below; the Functions host expects it there
  sourcemap: true,
  logLevel: "warning",
});

const pkg = JSON.parse(readFileSync(join(root, name, "package.json"), "utf8"));
writeFileSync(join(out, "package.json"), JSON.stringify({
  name: `pulsetide-${name}`,
  version: "1.0.0",
  private: true,
  main: "dist/index.js",
  dependencies: { "@azure/functions": pkg.dependencies["@azure/functions"] },
}, null, 2));
cpSync(join(root, name, "host.json"), join(out, "host.json"));
execSync("npm install --omit=dev --no-audit --no-fund --loglevel=error", { cwd: out, stdio: "inherit" });

// Catch the classic failure early: an error while loading the entry file takes down every function.
execSync(`node -e "require('./dist/index.js')"`, { cwd: out, stdio: "inherit" });
console.log(`Packaged ${name} -> .deploy/${name}`);

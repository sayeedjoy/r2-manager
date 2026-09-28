// Bundles the Node entry points into self-contained ESM files for the Docker image (Dokploy).
// tsc output can't run on its own: it keeps extensionless relative imports and @r2-manager/shared
// resolves to raw TypeScript. Bundling inlines both plus every npm dependency, so the runtime
// image needs no node_modules at all.
import { build } from "esbuild";

await build({
  entryPoints: {
    server: "src/entry/node.ts",
    migrate: "src/db/migrate.ts",
    "create-admin": "src/scripts/create-admin.ts",
  },
  // dist/bundle/ keeps the entries' "../../../.env" lookup pointing at the repo root.
  outdir: "dist/bundle",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  legalComments: "none",
  logLevel: "info",
  // CommonJS dependencies (nodemailer, dotenv, jszip) call require() for Node built-ins,
  // which an ESM bundle doesn't have unless we provide it.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
});

/**
 * Makes the `server-only` / `client-only` marker packages resolvable outside
 * the Next bundler.
 *
 * `lib/bank-qr-fallback.ts` imports `server-only`, so anything that reaches it
 * — orchestrator -> actions/engine -> mail-service -> bank-qr-fallback — cannot
 * be loaded by plain Node. The package is not in node_modules at all: Next
 * ships its own copy at `next/dist/compiled/server-only` and aliases the bare
 * specifier to it at build time. Under Node the import is simply MODULE_NOT_FOUND.
 *
 * This preload resolves both markers to an empty module, which is exactly what
 * the Next server bundle loads (their package exports map the `react-server`
 * condition to an empty file). The guards keep their full meaning in the app:
 * nothing here is imported by application code or the build, only by CLI
 * verification scripts that are already running server-side by definition.
 *
 * Both loader layers are patched because the two module systems resolve
 * independently: tsx compiles these TS files to CommonJS, so `require` is the
 * path that actually fires, while the ESM hook covers any native import.
 *
 * Usage (must come after tsx so this patch wraps tsx's, not the reverse):
 *   node --import tsx --import ./scripts/ai/loaders/register.mjs <script>
 */
import Module from "node:module";
import { register } from "node:module";
import { fileURLToPath } from "node:url";

const MARKERS = new Set(["server-only", "client-only"]);
const EMPTY_URL = new URL("./empty-module.cjs", import.meta.url);
const EMPTY_PATH = fileURLToPath(EMPTY_URL);

// --- CommonJS (the path tsx-compiled requires take) -------------------------
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (MARKERS.has(request)) return EMPTY_PATH;
  return originalResolveFilename.call(this, request, ...rest);
};

// --- ESM --------------------------------------------------------------------
register("./esm-hooks.mjs", import.meta.url);

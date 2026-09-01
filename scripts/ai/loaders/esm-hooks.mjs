/**
 * ESM resolution hook half of scripts/ai/loaders/register.mjs — see that file
 * for the rationale. Runs on the loader thread, so it must be a separate module.
 */
const MARKERS = new Set(["server-only", "client-only"]);
const EMPTY_URL = new URL("./empty-module.cjs", import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (MARKERS.has(specifier)) {
    return { url: EMPTY_URL, format: "commonjs", shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

/**
 * Stand-in for the `server-only` / `client-only` marker packages.
 *
 * Those packages exist purely to make a build fail when a module is imported
 * from the wrong environment. `server-only`'s real entry point is a bare
 * `throw`; its package exports map the `react-server` condition to an empty
 * file, which is what the Next server bundle actually loads. This file is that
 * empty module, for scripts that run server code directly under Node.
 *
 * See scripts/ai/loaders/register.mjs for why the substitution is needed.
 */
module.exports = {};

/**
 * Request-body handling: size caps, JSON parsing, and same-origin enforcement.
 *
 * Next.js route handlers have no body-size limit of their own — `req.json()`
 * will happily buffer a 500 MB upload into the server process. Every handler
 * that reads a body should go through `readJson` (checklist E-B09 / E-I06).
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** 100 KB is generous for a form payload and small enough to be harmless. */
export const DEFAULT_MAX_BODY_BYTES = 100 * 1024;

export type ReadJsonResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse };

/**
 * Reads and parses a JSON body with a hard byte cap.
 *
 * The cap is enforced twice: once from `content-length` (cheap, catches honest
 * clients) and once while draining the stream (catches a lying or chunked one).
 */
export async function readJson<T = unknown>(
  req: NextRequest | Request,
  opts: { maxBytes?: number } = {},
): Promise<ReadJsonResult<T>> {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BODY_BYTES;

  const declared = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, response: payloadTooLarge(maxBytes) };
  }

  const raw = await readTextCapped(req, maxBytes);
  if (raw === null) {
    return { ok: false, response: payloadTooLarge(maxBytes) };
  }

  if (raw.trim() === "") {
    return { ok: true, data: {} as T };
  }

  try {
    return { ok: true, data: JSON.parse(raw) as T };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Malformed JSON body" }, { status: 400 }),
    };
  }
}

/**
 * Drains a request body as text, aborting once `maxBytes` is exceeded.
 * Returns null when the cap is hit.
 */
export async function readTextCapped(
  req: NextRequest | Request,
  maxBytes: number,
): Promise<string | null> {
  const body = req.body;
  if (!body) return "";

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock?.();
  }

  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(joined);
}

export function payloadTooLarge(maxBytes: number) {
  return NextResponse.json(
    { error: `Request body exceeds the ${Math.floor(maxBytes / 1024)} KB limit` },
    { status: 413 },
  );
}

/**
 * Hosts a browser is allowed to send state-changing requests from.
 *
 * Auth.js protects its own endpoints and Server Actions carry an origin check,
 * but plain route handlers accept a cross-site `POST` with cookies attached.
 * `SameSite=Lax` blocks most of that already; this is the explicit second layer
 * the checklist asks for (E-I03, attack test T-020).
 */
function allowedOrigins(): string[] {
  const configured = [
    process.env.APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.SITE_URL,
    process.env.NEXTAUTH_URL,
    process.env.AUTH_URL,
  ].filter((v): v is string => Boolean(v));

  const extra = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  const origins = new Set<string>();
  for (const value of [...configured, ...extra]) {
    try {
      origins.add(new URL(value).origin);
    } catch {
      // Ignore malformed env values rather than failing every request.
    }
  }
  return [...origins];
}

const STATE_CHANGING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * True when a state-changing request did not come from an allowed origin.
 *
 * Requests with no `Origin`/`Referer` at all are allowed through: that is what
 * server-to-server callers (webhooks, cron, curl) look like, and they are
 * authenticated by signature or shared secret rather than by cookie. A browser
 * always sends `Origin` on a cross-site POST, which is the case this catches.
 */
export function isCrossOriginStateChange(req: NextRequest | Request): boolean {
  const method = req.method.toUpperCase();
  if (!STATE_CHANGING.has(method)) return false;

  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const candidate = origin ?? referer;
  if (!candidate) return false;

  let candidateOrigin: string;
  try {
    candidateOrigin = new URL(candidate).origin;
  } catch {
    return true; // Unparseable Origin is not a shape any real browser sends.
  }

  const selfOrigin = (() => {
    try {
      return new URL(req.url).origin;
    } catch {
      return null;
    }
  })();

  const allowed = new Set(allowedOrigins());
  if (selfOrigin) allowed.add(selfOrigin);

  const forwardedHost = req.headers.get("x-forwarded-host");
  const forwardedProto = req.headers.get("x-forwarded-proto") ?? "https";
  if (forwardedHost) allowed.add(`${forwardedProto}://${forwardedHost}`);

  return !allowed.has(candidateOrigin);
}

export function crossOriginBlocked() {
  return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
}

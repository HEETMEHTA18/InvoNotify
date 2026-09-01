/**
 * Authorization primitives shared by every route handler.
 *
 * There is no `middleware.ts` doing per-object authorization and there cannot
 * be one — middleware sees the URL, not the row. Object-level authorization
 * therefore has to happen in the query itself, in every handler, and the only
 * way that stays correct as the codebase grows is if there is exactly one
 * spelling of it. This module is that spelling.
 *
 * The rule (checklist E-B06 / API-A04, attack test T-006):
 *
 *   Never fetch a row by id and then check ownership in JavaScript.
 *   Put the owner in the WHERE clause so a foreign id simply matches nothing.
 *
 *   GOOD  prisma.invoice.findFirst({ where: { id, ...invoiceScope(userId) } })
 *   GOOD  prisma.invoice.updateMany({ where: { id, ...invoiceScope(userId) }, data })
 *   GOOD  prisma.invoice.deleteMany({ where: { id, ...invoiceScope(userId) } })
 *   BAD   const inv = await prisma.invoice.findUnique({ where: { id } })
 *         if (inv.ownerUserId !== userId) return 403        // race + easy to forget
 *   BAD   await prisma.invoice.delete({ where: { id } })    // unscoped write
 *
 * A miss must answer 404, not 403: a 403 confirms the row exists and turns the
 * endpoint into an existence oracle.
 */
import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import type { Session as AuthSession } from "next-auth";
import { auth } from "@/lib/auth";

/** Response for an unauthenticated caller. */
export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/** Response for "no such row, or not yours" — deliberately indistinguishable. */
export function notFound(what = "Resource") {
  return NextResponse.json({ error: `${what} not found` }, { status: 404 });
}

/** Response for a malformed path/query/body value. */
export function badRequest(message: string, details?: unknown) {
  return NextResponse.json(
    details === undefined ? { error: message } : { error: message, details },
    { status: 400 },
  );
}

// `auth` has overloads for route handlers and middleware. `ReturnType` selects
// its middleware overload rather than the no-argument server-session overload,
// so use NextAuth's public session type here instead.
export type Session = AuthSession | null;

/**
 * Resolves the caller's user id, or the 401 response to return.
 *
 * Usage:
 *   const who = await requireUser();
 *   if (!who.ok) return who.response;
 *   const userId = who.userId;
 */
export async function requireUser(): Promise<
  { ok: true; userId: string; session: NonNullable<Session> } | { ok: false; response: NextResponse }
> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!session || !userId) {
    return { ok: false, response: unauthorized() };
  }
  return { ok: true, userId, session };
}

/**
 * Parses a path parameter that must be a positive database id.
 *
 * `Number("abc")` is NaN and `Number("")` is 0; handing either to Prisma throws
 * and surfaces as a 500 with a driver message in it. Callers get null and
 * answer 400 (checklist API-B03 / E-B04).
 */
export function parseId(raw: string | undefined | null): number | null {
  if (raw === undefined || raw === null) return null;
  const trimmed = String(raw).trim();
  // Reject "1e3", "+1", " 1 ", "1.0", "0x10" — only plain digits are ids.
  if (!/^[0-9]{1,15}$/.test(trimmed)) return null;
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value) || value <= 0) return null;
  return value;
}

/**
 * Ownership predicate for `Invoice`.
 *
 * Invoices carry two owner columns: the newer `ownerUserId` and the legacy
 * `userId` that older rows were written with. Both have to be accepted or a
 * merchant loses access to their own history, so the scope is an OR — which is
 * exactly why it must live in one place instead of being retyped per handler.
 */
export function invoiceScope(userId: string): Prisma.InvoiceWhereInput {
  return { OR: [{ ownerUserId: userId }, { userId }] };
}

/** Ownership predicate for `Customer` (single owner column). */
export function customerScope(userId: string): Prisma.CustomerWhereInput {
  return { ownerUserId: userId };
}

/** Ownership predicate for `Product` (single owner column). */
export function productScope(userId: string): Prisma.ProductWhereInput {
  return { ownerUserId: userId };
}

/**
 * Ownership predicate for `RecoveryCase`.
 *
 * `RecoveryCase.ownerUserId` is nullable and the orchestrator currently writes
 * null, so ownership is really carried by the parent invoice. Accept either.
 */
export function recoveryCaseScope(userId: string): Prisma.RecoveryCaseWhereInput {
  return {
    OR: [
      { ownerUserId: userId },
      // Some legacy recovery cases have no direct owner. Their parent invoice
      // may use either the current ownerUserId or the legacy userId field.
      { invoice: { OR: [{ ownerUserId: userId }, { userId }] } },
    ],
  };
}

/**
 * Clamps a `?page=&pageSize=` pair.
 *
 * An unbounded pageSize is a free denial-of-service and a bulk-exfiltration
 * primitive: `?pageSize=1000000` makes the database materialise the whole table
 * (checklist E-I09, attack test T-030).
 */
export function parsePagination(
  params: URLSearchParams,
  opts: { defaultSize?: number; maxSize?: number } = {},
) {
  const defaultSize = opts.defaultSize ?? 50;
  const maxSize = opts.maxSize ?? 200;

  const rawPage = Number(params.get("page"));
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;

  const rawSize = Number(params.get("pageSize") ?? params.get("limit"));
  const pageSize =
    Number.isSafeInteger(rawSize) && rawSize > 0 ? Math.min(rawSize, maxSize) : defaultSize;

  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

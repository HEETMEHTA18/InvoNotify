import { Prisma } from "@/lib/db";

/** Convert request-derived JSON to Prisma's explicit JSON input type. */
export function toInputJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) return Prisma.JsonNull;
  return JSON.parse(serialized) as Prisma.InputJsonValue;
}

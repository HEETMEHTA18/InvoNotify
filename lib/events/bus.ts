import type { AppEvent, EventHandler, EventSubscription, EventType } from "./types";

let subscriptionIdCounter = 0;
const subscriptions = new Map<EventType, EventSubscription[]>();

/**
 * In-memory event bus for decoupled communication between system layers.
 *
 * In a production system this would be backed by Redis Streams, RabbitMQ,
 * or similar. For the hackathon, an in-process bus is sufficient and keeps
 * the demo self-contained.
 *
 * Events are dispatched asynchronously — handlers run in parallel and failures
 * are logged but do not block the caller.
 */

export function onEvent<T extends AppEvent>(
  eventType: T["type"],
  handler: EventHandler<T>,
): () => void {
  const id = String(++subscriptionIdCounter);
  const existing = subscriptions.get(eventType) || [];
  existing.push({ eventType, handler: handler as EventHandler, id });
  subscriptions.set(eventType, existing);

  // Return unsubscribe function
  return () => {
    const list = subscriptions.get(eventType);
    if (!list) return;
    const idx = list.findIndex((s) => s.id === id);
    if (idx >= 0) list.splice(idx, 1);
  };
}

/**
 * Emit an event to all registered subscribers. Failures in individual handlers
 * are caught and logged so the caller is never blocked.
 */
export async function emitEvent(event: AppEvent): Promise<void> {
  const handlers = subscriptions.get(event.type) || [];

  if (handlers.length === 0) {
    // No subscribers — store the event for audit purposes
    await storeEvent(event);
    return;
  }

  await Promise.allSettled(
    handlers.map(async (sub) => {
      try {
        await sub.handler(event);
      } catch (error) {
        console.error(
          `Event handler failed for ${event.type} [${sub.id}]:`,
          error,
        );
      }
    }),
  );

  // Store event for audit trail
  await storeEvent(event);
}

/**
 * Emit an event synchronously (fire-and-forget). Useful in contexts where
 * awaiting is not possible or desired.
 */
export function emitEventAsync(event: AppEvent): void {
  emitEvent(event).catch((error) => {
    console.error(`Failed to emit event ${event.type}:`, error);
  });
}

/**
 * Query the event audit log. Filters by event type and date range.
 */
export async function getEventLog(options?: {
  type?: EventType;
  source?: string;
  since?: Date;
  limit?: number;
}) {
  const { prisma } = await import("@/lib/db");

  const where: Record<string, unknown> = {};
  if (options?.type) where.eventType = options.type;
  if (options?.source) where.source = options.source;
  if (options?.since) where.receivedAt = { gte: options.since };

  return prisma.webhookEvent.findMany({
    where: where as never,
    orderBy: { receivedAt: "desc" },
    take: options?.limit || 50,
  });
}

/**
 * Minimal persistent store for events. In production this would be a
 * dedicated events table or a message queue. For now we write to
 * WebhookEvent with source="event-bus" for audit.
 */
async function storeEvent(event: AppEvent): Promise<void> {
  try {
    const { prisma } = await import("@/lib/db");

    const data = {
      eventId: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      eventType: event.type,
      payload: JSON.parse(JSON.stringify(event)) as never,
      source: event.source === "razorpay" || event.source === "stripe"
        ? event.source
        : "event-bus",
      status: "PROCESSED",
      processedAt: new Date(),
    };

    await prisma.webhookEvent.create({ data });
  } catch (error) {
    // Event storage is best-effort — don't let it break the flow
    console.warn("Failed to store event for audit:", error);
  }
}

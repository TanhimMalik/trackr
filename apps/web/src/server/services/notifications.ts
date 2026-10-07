import "server-only";
import { notificationForEvent } from "@trackr/domain";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { applications, notifications } from "@/server/db/schema";
import type {
  ApplicationEvent,
  Database,
  Notification,
} from "@/server/db/types";
import { assertId } from "./ids";

/** How many notifications the notification center shows. */
export const NOTIFICATION_LIST_LIMIT = 30;

export type NotificationItem = Pick<
  Notification,
  "id" | "type" | "title" | "body" | "readAt" | "createdAt" | "applicationId"
> & {
  companyName: string | null;
  companyDomain: string | null;
};

/** The latest notifications, newest first, with the company they're about. */
export async function listNotifications(
  userId: string,
  { limit = NOTIFICATION_LIST_LIMIT }: { limit?: number } = {},
  db: Database = getDb(),
): Promise<NotificationItem[]> {
  return db
    .select({
      id: notifications.id,
      type: notifications.type,
      title: notifications.title,
      body: notifications.body,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
      applicationId: notifications.applicationId,
      companyName: applications.companyName,
      companyDomain: applications.companyDomain,
    })
    .from(notifications)
    .leftJoin(applications, eq(applications.id, notifications.applicationId))
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit);
}

export async function countUnreadNotifications(
  userId: string,
  db: Database = getDb(),
): Promise<number> {
  const [row] = await db
    .select({ unread: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return row?.unread ?? 0;
}

/** Marks one notification as read. Repeating it, or a missing id, is harmless. */
export async function markNotificationRead(
  userId: string,
  notificationId: string,
  db: Database = getDb(),
): Promise<void> {
  assertId(notificationId, "Notification");
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
      ),
    );
}

/** Marks every unread notification as read. Returns how many there were. */
export async function markAllNotificationsRead(
  userId: string,
  db: Database = getDb(),
): Promise<number> {
  const updated = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .returning({ id: notifications.id });
  return updated.length;
}

export const eventDedupeKey = (eventId: string) => `event:${eventId}`;

/**
 * Creates the notification an event deserves, once. Runs inside the event
 * processor's transaction, after the status has been derived, and again when
 * an undone event is restored.
 */
export async function syncNotificationForEvent(
  tx: Database,
  event: ApplicationEvent,
  application: { companyName: string; jobTitle: string },
): Promise<void> {
  if (event.revertedAt) return;
  const notification = notificationForEvent(
    {
      type: event.eventType,
      sourceType: event.sourceType,
      statusBefore: event.statusBefore,
      statusAfter: event.statusAfter,
    },
    application.companyName,
  );
  if (!notification) return;

  await tx
    .insert(notifications)
    .values({
      userId: event.userId,
      applicationId: event.applicationId,
      eventId: event.id,
      type: notification.type,
      title: notification.title,
      body: application.jobTitle,
      dedupeKey: eventDedupeKey(event.id),
    })
    .onConflictDoNothing({
      target: [notifications.userId, notifications.dedupeKey],
    });
}

/** An undone event takes back what it announced. */
export async function removeNotificationsForEvent(
  tx: Database,
  eventId: string,
): Promise<void> {
  await tx.delete(notifications).where(eq(notifications.eventId, eventId));
}

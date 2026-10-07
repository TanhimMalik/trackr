"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import { NotFoundError } from "@/server/services/errors";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from "@/server/services/notifications";

export async function listNotificationsAction(): Promise<NotificationItem[]> {
  const user = await requireUser();
  return listNotifications(user.id);
}

export async function markNotificationReadAction(
  notificationId: string,
): Promise<void> {
  const user = await requireUser();
  try {
    await markNotificationRead(user.id, notificationId);
  } catch (error) {
    // A malformed id is just a notification that isn't there.
    if (!(error instanceof NotFoundError)) throw error;
    return;
  }
  revalidatePath("/", "layout");
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const user = await requireUser();
  await markAllNotificationsRead(user.id);
  revalidatePath("/", "layout");
}

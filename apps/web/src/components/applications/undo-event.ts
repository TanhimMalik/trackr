"use client";

import { toast } from "sonner";
import {
  restoreEventAction,
  undoEventAction,
} from "@/app/(app)/applications/actions";

/** Undoes an event and reports the outcome in a toast. */
export async function undoEvent(eventId: string): Promise<void> {
  const result = await undoEventAction(eventId);
  if (result.ok) {
    toast.success(result.message, {
      action: { label: "Redo", onClick: () => void restoreEvent(eventId) },
    });
  } else {
    toast.error(result.error);
  }
}

/** Brings back an undone event and reports the outcome in a toast. */
export async function restoreEvent(eventId: string): Promise<void> {
  const result = await restoreEventAction(eventId);
  if (result.ok) toast.success(result.message);
  else toast.error(result.error);
}

/**
 * Toast options offering to undo the event a change just recorded, shown long
 * enough to reach the button.
 */
export const withUndo = (eventId: string | undefined) =>
  eventId
    ? {
        action: { label: "Undo", onClick: () => void undoEvent(eventId) },
        duration: 8000,
      }
    : {};

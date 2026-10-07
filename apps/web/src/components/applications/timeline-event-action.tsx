"use client";

import { RotateCcw, Undo2 } from "lucide-react";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { restoreEvent, undoEvent } from "./undo-event";

/** The Undo or Restore button on a timeline entry. */
export function TimelineEventAction({
  eventId,
  action,
  label,
}: {
  eventId: string;
  action: "undo" | "restore";
  /** The entry's title, for screen readers ("Undo Interview requested"). */
  label: string;
}) {
  const [pending, startTransition] = useTransition();
  const undo = action === "undo";

  return (
    <Button
      variant="ghost"
      size="xs"
      disabled={pending}
      onClick={() =>
        startTransition(() =>
          undo ? undoEvent(eventId) : restoreEvent(eventId),
        )
      }
      aria-label={`${undo ? "Undo" : "Restore"} ${label}`}
      className="text-muted-foreground"
    >
      {undo ? <Undo2 aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}
      {undo ? "Undo" : "Restore"}
    </Button>
  );
}

"use client";

import type { ApplicationStatus } from "@trackr/domain";
import { useTransition } from "react";
import { toast } from "sonner";
import { changeApplicationStatusAction } from "@/app/(app)/applications/actions";
import { withUndo } from "./undo-event";

/** Changes an application's status by hand, with a confirmation toast. */
export function useChangeStatus(
  applicationId: string,
  companyName: string,
  currentStatus: ApplicationStatus,
) {
  const [pending, startTransition] = useTransition();

  function changeStatus(next: ApplicationStatus) {
    if (next === currentStatus) return;
    startTransition(async () => {
      const result = await changeApplicationStatusAction(applicationId, next);
      if (result?.ok) {
        toast.success(
          `${companyName}: ${result.message}`,
          withUndo(result.eventId),
        );
      } else {
        toast.error(result?.error ?? "Couldn't change the status.");
      }
    });
  }

  return { changeStatus, pending };
}

"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import type { ApplicationFormState } from "@/app/(app)/applications/actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/** Asks before deleting (or another destructive step), runs it, and reports the outcome in a toast. */
export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  confirmLabel = "Delete",
  pendingLabel = "Deleting…",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => Promise<ApplicationFormState>;
  confirmLabel?: string;
  pendingLabel?: string;
}) {
  const [deleting, startDelete] = useTransition();

  function confirm(event: React.MouseEvent) {
    // Keep the dialog open until the deletion finishes.
    event.preventDefault();
    startDelete(async () => {
      const result = await onConfirm();
      onOpenChange(false);
      if (result?.ok) toast.success(result.message);
      else toast.error(result?.error ?? "Couldn't delete it. Try again.");
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={deleting}
            onClick={confirm}
          >
            {deleting ? pendingLabel : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

"use client";

import { Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  createApplicationAction,
  deleteApplicationAction,
  updateApplicationAction,
} from "@/app/(app)/applications/actions";
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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ApplicationForm,
  type ApplicationFormDefaults,
} from "./application-form";

const dialogContentClass =
  "flex max-h-[min(90dvh,48rem)] flex-col gap-0 p-0 sm:max-w-2xl";

/** The "Add application" form in a dialog; `children` becomes its trigger. */
export function AddApplicationDialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent className={dialogContentClass}>
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>Add application</DialogTitle>
          <DialogDescription>
            Track a job you applied to or want to apply to.
          </DialogDescription>
        </DialogHeader>
        <ApplicationForm
          mode="create"
          action={createApplicationAction}
          onDone={() => onOpenChange(false)}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

export function AddApplicationButton({
  size = "default",
}: {
  size?: "default" | "sm";
}) {
  const [open, setOpen] = useState(false);

  return (
    <AddApplicationDialog open={open} onOpenChange={setOpen}>
      <Button size={size}>
        <Plus />
        Add application
      </Button>
    </AddApplicationDialog>
  );
}

export function EditApplicationDialog({
  applicationId,
  defaults,
  open,
  onOpenChange,
}: {
  applicationId: string;
  defaults: ApplicationFormDefaults;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={dialogContentClass}>
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>Edit application</DialogTitle>
          <DialogDescription>
            {defaults.companyName} · {defaults.jobTitle}
          </DialogDescription>
        </DialogHeader>
        <ApplicationForm
          mode="edit"
          defaults={defaults}
          action={updateApplicationAction.bind(null, applicationId)}
          onDone={() => onOpenChange(false)}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

export function DeleteApplicationDialog({
  applicationId,
  label,
  open,
  onOpenChange,
  onDeleted,
}: {
  applicationId: string;
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Runs after a successful delete, e.g. to leave the detail view. */
  onDeleted?: () => void;
}) {
  const [deleting, startDelete] = useTransition();

  function confirmDelete(event: React.MouseEvent) {
    // Keep the dialog open until the deletion finishes.
    event.preventDefault();
    startDelete(async () => {
      const result = await deleteApplicationAction(applicationId);
      onOpenChange(false);
      if (result?.ok) {
        toast.success(result.message);
        onDeleted?.();
      } else {
        toast.error(result?.error ?? "Couldn't delete the application.");
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this application?</AlertDialogTitle>
          <AlertDialogDescription>
            {label} and its full history will be permanently deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={deleting}
            onClick={confirmDelete}
          >
            {deleting ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

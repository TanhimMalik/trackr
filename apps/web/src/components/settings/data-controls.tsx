"use client";

import { Download, Trash2 } from "lucide-react";
import { useId, useState, useTransition } from "react";
import {
  deleteAccountAction,
  deleteEmailDataAction,
} from "@/app/(app)/settings/actions";
import { ConfirmDeleteDialog } from "@/components/forms/confirm-delete-dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function Row({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-0.5">
        <p className="font-medium">{title}</p>
        <p className="text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** Export everything, delete what came from Gmail, or delete the account. */
export function DataControls({
  canDeleteAccount,
}: {
  canDeleteAccount: boolean;
}) {
  const [deletingEmail, setDeletingEmail] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  return (
    <div className="divide-y">
      <Row
        title="Export your data"
        description="Everything Trackr keeps about you, as a JSON file. Access tokens and other secrets are left out."
      >
        <Button variant="outline" size="sm" asChild>
          {/* A plain download: the route sends the file. */}
          <a href="/api/account/export" download>
            <Download aria-hidden="true" />
            Export
          </a>
        </Button>
      </Row>
      <Row
        title="Delete email data"
        description="Removes the senders, subjects and short previews Trackr kept from Gmail, and the emails waiting for review. Applications and their history stay."
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => setDeletingEmail(true)}
        >
          Delete email data
        </Button>
      </Row>
      {canDeleteAccount && (
        <Row
          title="Delete account"
          description="Deletes your account and everything in it, and revokes Trackr's access to Gmail. This can't be undone."
        >
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeletingAccount(true)}
          >
            <Trash2 aria-hidden="true" />
            Delete account
          </Button>
        </Row>
      )}

      <ConfirmDeleteDialog
        open={deletingEmail}
        onOpenChange={setDeletingEmail}
        title="Delete email data?"
        description="Stored email details and pending email reviews are deleted. Applications, their history and your Gmail connection stay; Trackr only reads new mail from now on."
        confirmLabel="Delete email data"
        onConfirm={deleteEmailDataAction}
      />
      <DeleteAccountDialog
        open={deletingAccount}
        onOpenChange={setDeletingAccount}
      />
    </div>
  );
}

function DeleteAccountDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const id = useId();
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startDeleting] = useTransition();
  const ready = confirmation.trim().toLowerCase() === "delete";

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready) return;
    startDeleting(async () => {
      // On success the action signs out and leaves the app.
      const result = await deleteAccountAction(confirmation);
      setError(result.error);
    });
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setConfirmation("");
        setError(null);
        onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <form onSubmit={submit} className="contents">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              Your applications, their history, contacts, interviews, stored
              email details and settings are deleted for good, connected
              browsers are signed out and Gmail access is revoked.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={id}>
              Type <span className="font-semibold">delete</span> to confirm
            </Label>
            <Input
              id={id}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `${id}-error` : undefined}
            />
            {error && (
              <p
                id={`${id}-error`}
                className="text-[0.8125rem] text-destructive"
              >
                {error}
              </p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <Button
              type="submit"
              variant="destructive"
              disabled={!ready || pending}
            >
              {pending ? "Deleting…" : "Delete account"}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

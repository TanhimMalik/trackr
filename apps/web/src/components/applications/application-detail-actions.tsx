"use client";

import {
  APPLICATION_STATUS_LABELS,
  PLACEHOLDER_JOB_TITLE,
  type ApplicationStatus,
} from "@trackr/domain";
import {
  ChevronDown,
  CircleHelp,
  Ellipsis,
  ExternalLink,
  ListPlus,
  Maximize2,
  Pencil,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SELECTABLE_STATUSES } from "@/lib/applications/input";
import {
  DeleteApplicationDialog,
  EditApplicationDialog,
} from "./application-dialogs";
import type { ApplicationFormDefaults } from "./application-form";
import { LogActivityDialog } from "./log-activity-dialog";
import { StatusDot } from "./status-badge";
import { useChangeStatus } from "./use-change-status";

/** Status, edit, posting and delete controls for the application detail view. */
export function ApplicationDetailActions({
  applicationId,
  status,
  defaults,
  variant,
}: {
  applicationId: string;
  status: ApplicationStatus;
  defaults: ApplicationFormDefaults;
  variant: "drawer" | "page";
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"edit" | "log" | "delete" | null>(null);
  const { changeStatus, pending } = useChangeStatus(
    applicationId,
    defaults.companyName,
    status,
  );

  // Leave the detail view once the application is gone.
  const onDeleted = () =>
    variant === "drawer" ? router.back() : router.push("/applications");

  return (
    <>
      {!defaults.jobTitle && (
        // Started from an email that didn't name the role.
        <div className="flex items-center gap-3 rounded-xl border bg-muted/50 px-4 py-3">
          <CircleHelp
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="min-w-0 flex-1">
            The email didn&apos;t say which role this is.
          </p>
          <Button size="sm" variant="outline" onClick={() => setDialog("edit")}>
            Add role
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={pending}>
              <StatusDot status={status} />
              {APPLICATION_STATUS_LABELS[status]}
              <ChevronDown className="text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuRadioGroup
              value={status}
              onValueChange={(value) =>
                changeStatus(value as ApplicationStatus)
              }
            >
              {SELECTABLE_STATUSES.map((option) => (
                <DropdownMenuRadioItem key={option} value={option}>
                  <StatusDot status={option} />
                  {APPLICATION_STATUS_LABELS[option]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="outline" size="sm" onClick={() => setDialog("log")}>
          <ListPlus />
          Log activity
        </Button>

        <Button variant="outline" size="sm" onClick={() => setDialog("edit")}>
          <Pencil />
          Edit
        </Button>

        {defaults.jobUrl && (
          <Button variant="outline" size="sm" asChild>
            <a href={defaults.jobUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink />
              Job posting
            </a>
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="More actions">
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {variant === "drawer" && (
              // A full page load, so the link is not intercepted back into the drawer.
              <DropdownMenuItem asChild>
                <a href={`/applications/${applicationId}`}>
                  <Maximize2 />
                  Open full page
                </a>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => setDialog("delete")}
            >
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <EditApplicationDialog
        applicationId={applicationId}
        defaults={defaults}
        open={dialog === "edit"}
        onOpenChange={(open) => setDialog(open ? "edit" : null)}
      />
      <LogActivityDialog
        applicationId={applicationId}
        companyName={defaults.companyName}
        open={dialog === "log"}
        onOpenChange={(open) => setDialog(open ? "log" : null)}
      />
      <DeleteApplicationDialog
        applicationId={applicationId}
        label={`${defaults.companyName} · ${defaults.jobTitle || PLACEHOLDER_JOB_TITLE}`}
        open={dialog === "delete"}
        onOpenChange={(open) => setDialog(open ? "delete" : null)}
        onDeleted={onDeleted}
      />
    </>
  );
}

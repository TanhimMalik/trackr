"use client";

import {
  APPLICATION_STATUS_LABELS,
  type ApplicationStatus,
} from "@trackr/domain";
import { ArrowRightLeft, Ellipsis, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SELECTABLE_STATUSES } from "@/lib/applications/input";
import { cn } from "@/lib/utils";
import {
  DeleteApplicationDialog,
  EditApplicationDialog,
} from "./application-dialogs";
import type { ApplicationFormDefaults } from "./application-form";
import { StatusDot } from "./status-badge";
import { useChangeStatus } from "./use-change-status";

export function ApplicationRowActions({
  applicationId,
  status,
  defaults,
  className,
}: {
  applicationId: string;
  status: ApplicationStatus;
  defaults: ApplicationFormDefaults;
  className?: string;
}) {
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null);
  const label = `${defaults.companyName} · ${defaults.jobTitle}`;
  const { changeStatus } = useChangeStatus(
    applicationId,
    defaults.companyName,
    status,
  );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Actions for ${label}`}
            className={cn(className)}
          >
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onSelect={() => setDialog("edit")}>
            <Pencil />
            Edit
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <ArrowRightLeft />
              Change status
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-44">
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
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setDialog("delete")}
          >
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Rendered beside the menu, not inside it, so focus returns correctly. */}
      <EditApplicationDialog
        applicationId={applicationId}
        defaults={defaults}
        open={dialog === "edit"}
        onOpenChange={(open) => setDialog(open ? "edit" : null)}
      />
      <DeleteApplicationDialog
        applicationId={applicationId}
        label={label}
        open={dialog === "delete"}
        onOpenChange={(open) => setDialog(open ? "delete" : null)}
      />
    </>
  );
}

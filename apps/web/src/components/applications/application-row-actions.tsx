"use client";

import { Ellipsis, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  DeleteApplicationDialog,
  EditApplicationDialog,
} from "./application-dialogs";
import type { ApplicationFormDefaults } from "./application-form";

export function ApplicationRowActions({
  applicationId,
  defaults,
}: {
  applicationId: string;
  defaults: ApplicationFormDefaults;
}) {
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null);
  const label = `${defaults.companyName} · ${defaults.jobTitle}`;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Actions for ${label}`}
          >
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onSelect={() => setDialog("edit")}>
            <Pencil />
            Edit
          </DropdownMenuItem>
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

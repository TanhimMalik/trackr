"use client";

import {
  INTERVIEW_STATUS_LABELS,
  INTERVIEW_STATUSES,
  INTERVIEW_TYPE_LABELS,
  INTERVIEW_TYPES,
  type InterviewStatus,
} from "@trackr/domain";
import {
  CalendarDays,
  Ellipsis,
  ExternalLink,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  createInterviewAction,
  deleteInterviewAction,
  setInterviewStatusAction,
  updateInterviewAction,
} from "@/app/(app)/applications/detail-actions";
import { DateTimeText } from "@/components/date-text";
import { ConfirmDeleteDialog } from "@/components/forms/confirm-delete-dialog";
import { DialogForm, FormDialog } from "@/components/forms/form-dialog";
import { FormField } from "@/components/forms/form-field";
import { optionsFrom, SelectField } from "@/components/forms/select-field";
import { useFormAction } from "@/components/forms/use-form-action";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  localDateTimeInputValue,
  localDateTimeToIso,
} from "@/lib/applications/details-input";
import { NO_SELECTION } from "@/lib/applications/form-data";
import { cn } from "@/lib/utils";
import type { Contact, Interview } from "@/server/db/types";

// Static class names so Tailwind can see them.
const STATUS_DOT: Record<InterviewStatus, string> = {
  SCHEDULED: "bg-status-interview",
  COMPLETED: "bg-status-offer",
  CANCELED: "bg-status-neutral",
};

type ContactOption = Pick<Contact, "id" | "name">;

/** An application's interviews, with adding, editing and status changes. */
export function ApplicationInterviews({
  applicationId,
  interviews,
  contacts,
}: {
  applicationId: string;
  interviews: Interview[];
  contacts: ContactOption[];
}) {
  const [adding, setAdding] = useState(false);
  const contactNames = new Map(contacts.map((c) => [c.id, c.name]));

  return (
    <section aria-labelledby="interviews-heading" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 id="interviews-heading" className="font-semibold">
          Interviews
        </h3>
        <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
          <Plus aria-hidden="true" />
          Add interview
        </Button>
      </div>
      {interviews.length === 0 ? (
        <p className="text-muted-foreground">No interviews yet.</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {interviews.map((interview) => (
            <InterviewRow
              key={interview.id}
              interview={interview}
              contactName={
                interview.contactId
                  ? contactNames.get(interview.contactId)
                  : undefined
              }
              contacts={contacts}
            />
          ))}
        </ul>
      )}
      <InterviewDialog
        open={adding}
        onOpenChange={setAdding}
        applicationId={applicationId}
        contacts={contacts}
      />
    </section>
  );
}

function InterviewRow({
  interview,
  contactName,
  contacts,
}: {
  interview: Interview;
  contactName: string | undefined;
  contacts: ContactOption[];
}) {
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null);
  const [pending, startTransition] = useTransition();
  const title = INTERVIEW_TYPE_LABELS[interview.interviewType];
  const details = [
    interview.durationMinutes ? `${interview.durationMinutes} min` : null,
    interview.location,
    contactName ? `with ${contactName}` : null,
  ].filter(Boolean);

  function changeStatus(status: string) {
    if (status === interview.status) return;
    startTransition(async () => {
      const result = await setInterviewStatusAction(
        interview.id,
        status as InterviewStatus,
      );
      if (result?.ok) toast.success(result.message);
      else toast.error(result?.error ?? "Couldn't update the interview.");
    });
  }

  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <CalendarDays className="size-4" aria-hidden="true" />
      </span>
      <div
        className={cn(
          "min-w-0 flex-1",
          interview.status === "CANCELED" && "opacity-60",
        )}
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <p
            className={cn(
              "font-medium",
              interview.status === "CANCELED" && "line-through",
            )}
          >
            {title}
          </p>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              aria-hidden="true"
              className={cn(
                "size-1.5 rounded-full",
                STATUS_DOT[interview.status],
              )}
            />
            {INTERVIEW_STATUS_LABELS[interview.status]}
          </span>
        </div>
        <p className="text-muted-foreground">
          {interview.scheduledAt ? (
            <DateTimeText date={interview.scheduledAt} />
          ) : (
            "Time to be confirmed"
          )}
          {details.length > 0 && ` · ${details.join(" · ")}`}
        </p>
        {interview.meetingUrl && (
          <a
            href={interview.meetingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-0.5 inline-flex items-center gap-1 text-[0.8125rem] text-primary-text underline-offset-4 hover:underline"
          >
            Join link
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        )}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={pending}
            aria-label={`Actions for ${title}`}
          >
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={() => setDialog("edit")}>
            <Pencil />
            Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            value={interview.status}
            onValueChange={changeStatus}
          >
            {INTERVIEW_STATUSES.map((status) => (
              <DropdownMenuRadioItem key={status} value={status}>
                {INTERVIEW_STATUS_LABELS[status]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
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

      <InterviewDialog
        open={dialog === "edit"}
        onOpenChange={(open) => setDialog(open ? "edit" : null)}
        interview={interview}
        contacts={contacts}
      />
      <ConfirmDeleteDialog
        open={dialog === "delete"}
        onOpenChange={(open) => setDialog(open ? "delete" : null)}
        title="Delete this interview?"
        description={`The ${title.toLowerCase()} will be removed from this application. Its history in the timeline stays.`}
        onConfirm={() => deleteInterviewAction(interview.id)}
      />
    </li>
  );
}

function InterviewDialog({
  open,
  onOpenChange,
  applicationId,
  interview,
  contacts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** For adding; editing uses the interview's own application. */
  applicationId?: string;
  interview?: Interview;
  contacts: ContactOption[];
}) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={interview ? "Edit interview" : "Add interview"}
    >
      <InterviewForm
        applicationId={applicationId}
        interview={interview}
        contacts={contacts}
        onClose={() => onOpenChange(false)}
      />
    </FormDialog>
  );
}

function InterviewForm({
  applicationId,
  interview,
  contacts,
  onClose,
}: {
  applicationId?: string;
  interview?: Interview;
  contacts: ContactOption[];
  onClose: () => void;
}) {
  const action = interview
    ? updateInterviewAction.bind(null, interview.id)
    : createInterviewAction.bind(null, applicationId ?? "");
  const { onSubmit, pending, errors, formError } = useFormAction(action, {
    onSuccess: (result) => {
      toast.success(result.message);
      onClose();
    },
    prepare: (formData) => {
      const scheduledAt = localDateTimeToIso(
        formData.get("scheduledAtLocal") as string | null,
      );
      formData.delete("scheduledAtLocal");
      if (scheduledAt) formData.set("scheduledAt", scheduledAt);
    },
  });

  return (
    <DialogForm
      onSubmit={onSubmit}
      onCancel={onClose}
      submitLabel={interview ? "Save changes" : "Add interview"}
      pendingLabel={interview ? "Saving…" : "Adding…"}
      pending={pending}
      formError={formError}
    >
      <SelectField
        label="Type"
        name="interviewType"
        defaultValue={interview?.interviewType ?? "TECHNICAL"}
        options={optionsFrom(INTERVIEW_TYPES, INTERVIEW_TYPE_LABELS)}
        error={errors.interviewType}
      />
      <SelectField
        label="Status"
        name="status"
        defaultValue={interview?.status ?? "SCHEDULED"}
        options={optionsFrom(INTERVIEW_STATUSES, INTERVIEW_STATUS_LABELS)}
        error={errors.status}
      />
      <FormField
        label="Date and time"
        error={errors.scheduledAt}
        hint="Leave empty if it isn't set yet."
      >
        {(control) => (
          <Input
            {...control}
            type="datetime-local"
            name="scheduledAtLocal"
            defaultValue={
              interview?.scheduledAt
                ? localDateTimeInputValue(interview.scheduledAt)
                : undefined
            }
          />
        )}
      </FormField>
      <FormField label="Length (minutes)" error={errors.durationMinutes}>
        {(control) => (
          <Input
            {...control}
            name="durationMinutes"
            inputMode="numeric"
            placeholder="45"
            defaultValue={interview?.durationMinutes ?? undefined}
          />
        )}
      </FormField>
      <FormField
        label="Meeting link"
        error={errors.meetingUrl}
        className="sm:col-span-2"
      >
        {(control) => (
          <Input
            {...control}
            name="meetingUrl"
            type="url"
            placeholder="https://"
            defaultValue={interview?.meetingUrl ?? undefined}
          />
        )}
      </FormField>
      <FormField label="Location" error={errors.location}>
        {(control) => (
          <Input
            {...control}
            name="location"
            placeholder="Office, or leave empty"
            defaultValue={interview?.location ?? undefined}
          />
        )}
      </FormField>
      {contacts.length > 0 && (
        <SelectField
          label="With"
          name="contactId"
          defaultValue={interview?.contactId ?? NO_SELECTION}
          options={[
            { value: NO_SELECTION, label: "Nobody in particular" },
            ...contacts.map((contact) => ({
              value: contact.id,
              label: contact.name,
            })),
          ]}
          error={errors.contactId}
        />
      )}
    </DialogForm>
  );
}

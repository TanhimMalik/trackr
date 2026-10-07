"use client";

import { INTERVIEW_TYPE_LABELS, INTERVIEW_TYPES } from "@trackr/domain";
import { useState } from "react";
import { toast } from "sonner";
import { logActivityAction } from "@/app/(app)/applications/detail-actions";
import { DialogForm, FormDialog } from "@/components/forms/form-dialog";
import { FormField } from "@/components/forms/form-field";
import { optionsFrom, SelectField } from "@/components/forms/select-field";
import { useFormAction } from "@/components/forms/use-form-action";
import { Input } from "@/components/ui/input";
import {
  LOGGABLE_EVENTS,
  localDateTimeToIso,
  type LoggableEventType,
} from "@/lib/applications/details-input";
import {
  appliedDateToIso,
  localDateInputValue,
  NO_SELECTION,
} from "@/lib/applications/form-data";
import { withUndo } from "./undo-event";

const TYPE_OPTIONS = Object.entries(LOGGABLE_EVENTS).map(([value, label]) => ({
  value,
  label,
}));

const KIND_OPTIONS = [
  { value: NO_SELECTION, label: "Not specified" },
  ...optionsFrom(INTERVIEW_TYPES, INTERVIEW_TYPE_LABELS),
];

/**
 * Records something that happened by hand: a recruiter reaching out, an
 * interview being scheduled, a follow-up sent. It joins the timeline and can
 * move the status, like events detected automatically.
 */
export function LogActivityDialog({
  applicationId,
  companyName,
  open,
  onOpenChange,
}: {
  applicationId: string;
  companyName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Log activity"
      description={`Record something that happened with ${companyName}.`}
    >
      <LogActivityForm
        applicationId={applicationId}
        onClose={() => onOpenChange(false)}
      />
    </FormDialog>
  );
}

function LogActivityForm({
  applicationId,
  onClose,
}: {
  applicationId: string;
  onClose: () => void;
}) {
  const [type, setType] = useState<LoggableEventType>("RECRUITER_CONTACT");
  const { onSubmit, pending, errors, formError } = useFormAction(
    logActivityAction.bind(null, applicationId),
    {
      onSuccess: (result) => {
        toast.success(result.message, withUndo(result.eventId));
        onClose();
      },
      prepare: (formData) => {
        const occurredAt = appliedDateToIso(
          formData.get("occurredDate") as string | null,
        );
        formData.delete("occurredDate");
        if (occurredAt) formData.set("occurredAt", occurredAt);
        const scheduledAt = localDateTimeToIso(
          formData.get("scheduledAtLocal") as string | null,
        );
        formData.delete("scheduledAtLocal");
        if (scheduledAt) formData.set("scheduledAt", scheduledAt);
      },
    },
  );
  const today = localDateInputValue(new Date());
  const isInterview =
    type === "INTERVIEW_REQUESTED" || type === "INTERVIEW_SCHEDULED";

  return (
    <DialogForm
      onSubmit={onSubmit}
      onCancel={onClose}
      submitLabel="Log activity"
      pendingLabel="Logging…"
      pending={pending}
      formError={formError}
    >
      <SelectField
        label="What happened"
        name="type"
        defaultValue={type}
        onValueChange={(value) => setType(value as LoggableEventType)}
        options={TYPE_OPTIONS}
        error={errors.type}
        className="sm:col-span-2"
      />
      <FormField label="Date" error={errors.occurredAt}>
        {(control) => (
          <Input
            {...control}
            type="date"
            name="occurredDate"
            defaultValue={today}
            max={today}
          />
        )}
      </FormField>
      {isInterview && (
        <SelectField
          label="Interview type"
          name="interviewKind"
          defaultValue={NO_SELECTION}
          options={KIND_OPTIONS}
          error={errors.interviewKind}
        />
      )}
      {type === "INTERVIEW_SCHEDULED" && (
        <FormField
          label="Interview time"
          error={errors.scheduledAt}
          hint="Adds the interview to this application."
          className="sm:col-span-2"
        >
          {(control) => (
            <Input {...control} type="datetime-local" name="scheduledAtLocal" />
          )}
        </FormField>
      )}
      {type === "NEXT_ROUND" && (
        <label className="flex items-center gap-2 self-end pb-2 sm:col-span-2">
          <input
            type="checkbox"
            name="isFinalRound"
            className="size-4 accent-primary"
          />
          This is the final round
        </label>
      )}
    </DialogForm>
  );
}

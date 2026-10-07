"use client";

import {
  APPLICATION_SOURCE_LABELS,
  APPLICATION_SOURCES,
  APPLICATION_STATUS_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  EMPLOYMENT_TYPES,
  SOURCE_PLATFORM_LABELS,
  SOURCE_PLATFORMS,
} from "@trackr/domain";
import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import type { ApplicationFormState } from "@/app/(app)/applications/actions";
import { FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  appliedDateToIso,
  localDateInputValue,
  NO_SELECTION,
} from "@/lib/applications/form-data";
import { SELECTABLE_STATUSES } from "@/lib/applications/input";

const CURRENCIES = ["USD", "CAD", "EUR", "GBP", "AUD", "INR"];

/** The editable fields of an existing application, used to prefill the edit form. */
export type ApplicationFormDefaults = {
  companyName: string;
  companyDomain: string | null;
  jobTitle: string;
  jobUrl: string | null;
  location: string | null;
  employmentType: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  source: string | null;
  sourcePlatform: string | null;
  notes: string | null;
};

type Option = { value: string; label: string };

function SelectField({
  label,
  name,
  defaultValue,
  options,
  error,
  hint,
  onValueChange,
}: {
  label: string;
  name: string;
  defaultValue: string;
  options: Option[];
  error?: string;
  hint?: string;
  onValueChange?: (value: string) => void;
}) {
  return (
    <FormField label={label} error={error} hint={hint}>
      {(control) => (
        <Select
          name={name}
          defaultValue={defaultValue}
          onValueChange={onValueChange}
        >
          <SelectTrigger {...control} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </FormField>
  );
}

const optionsFrom = (
  values: readonly string[],
  labels: Record<string, string>,
): Option[] =>
  values.map((value) => ({ value, label: labels[value] ?? value }));

export function ApplicationForm({
  mode,
  defaults,
  action,
  onDone,
  onCancel,
}: {
  mode: "create" | "edit";
  defaults?: ApplicationFormDefaults;
  action: (
    state: ApplicationFormState,
    formData: FormData,
  ) => Promise<ApplicationFormState>;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [state, dispatch, pending] = useActionState<
    ApplicationFormState,
    FormData
  >(async (previous, formData) => {
    const result = await action(previous, formData);
    if (result?.ok) {
      toast.success(result.message);
      onDone();
    }
    return result;
  }, null);
  const [, startTransition] = useTransition();
  const [status, setStatus] = useState("APPLIED");
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const today = localDateInputValue(new Date());

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    // Submitting manually keeps typed values when validation fails; a form
    // action would reset the fields.
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const appliedAt = appliedDateToIso(
      formData.get("appliedDate") as string | null,
    );
    formData.delete("appliedDate");
    if (appliedAt) formData.set("appliedAt", appliedAt);
    startTransition(() => dispatch(formData));
  }

  const currencyOptions = [
    ...new Set([...CURRENCIES, defaults?.salaryCurrency ?? "USD"]),
  ].map((code) => ({ value: code, label: code }));

  return (
    <form onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-col">
      <div className="grid gap-4 overflow-y-auto px-5 py-4 sm:grid-cols-2">
        {state && !state.ok && state.error && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive sm:col-span-2"
          >
            {state.error}
          </p>
        )}

        <FormField label="Company" error={errors.companyName}>
          {(control) => (
            <Input
              {...control}
              name="companyName"
              defaultValue={defaults?.companyName}
              autoComplete="organization"
              autoFocus
            />
          )}
        </FormField>
        <FormField label="Role" error={errors.jobTitle}>
          {(control) => (
            <Input
              {...control}
              name="jobTitle"
              defaultValue={defaults?.jobTitle}
              autoComplete="organization-title"
            />
          )}
        </FormField>

        {mode === "create" && (
          <>
            <SelectField
              label="Status"
              name="status"
              defaultValue={status}
              onValueChange={setStatus}
              error={errors.status}
              options={SELECTABLE_STATUSES.map((value) => ({
                value,
                label: APPLICATION_STATUS_LABELS[value],
              }))}
            />
            {status !== "SAVED" && (
              <FormField label="Applied on" error={errors.appliedAt}>
                {(control) => (
                  <Input
                    {...control}
                    type="date"
                    name="appliedDate"
                    defaultValue={today}
                    max={today}
                  />
                )}
              </FormField>
            )}
          </>
        )}

        <FormField label="Job link" error={errors.jobUrl}>
          {(control) => (
            <Input
              {...control}
              type="url"
              name="jobUrl"
              placeholder="https://"
              defaultValue={defaults?.jobUrl ?? ""}
            />
          )}
        </FormField>
        <FormField
          label="Company website"
          error={errors.companyWebsite}
          hint="Used for the company logo, e.g. stripe.com"
        >
          {(control) => (
            <Input
              {...control}
              name="companyWebsite"
              placeholder="stripe.com"
              defaultValue={defaults?.companyDomain ?? ""}
            />
          )}
        </FormField>

        <FormField label="Location" error={errors.location}>
          {(control) => (
            <Input
              {...control}
              name="location"
              placeholder="Remote, New York…"
              defaultValue={defaults?.location ?? ""}
            />
          )}
        </FormField>
        <SelectField
          label="Employment type"
          name="employmentType"
          defaultValue={defaults?.employmentType ?? NO_SELECTION}
          error={errors.employmentType}
          options={[
            { value: NO_SELECTION, label: "Not specified" },
            ...optionsFrom(EMPLOYMENT_TYPES, EMPLOYMENT_TYPE_LABELS),
          ]}
        />

        <div className="grid grid-cols-[1fr_1fr_6rem] gap-3 sm:col-span-2">
          <FormField label="Salary from" error={errors.salaryMin}>
            {(control) => (
              <Input
                {...control}
                name="salaryMin"
                inputMode="numeric"
                placeholder="120k"
                defaultValue={defaults?.salaryMin ?? ""}
              />
            )}
          </FormField>
          <FormField label="Salary to" error={errors.salaryMax}>
            {(control) => (
              <Input
                {...control}
                name="salaryMax"
                inputMode="numeric"
                placeholder="150k"
                defaultValue={defaults?.salaryMax ?? ""}
              />
            )}
          </FormField>
          <SelectField
            label="Currency"
            name="salaryCurrency"
            defaultValue={defaults?.salaryCurrency ?? "USD"}
            error={errors.salaryCurrency}
            options={currencyOptions}
          />
        </div>

        <SelectField
          label="Found through"
          name="source"
          defaultValue={defaults?.source ?? NO_SELECTION}
          error={errors.source}
          options={[
            { value: NO_SELECTION, label: "Not specified" },
            ...optionsFrom(APPLICATION_SOURCES, APPLICATION_SOURCE_LABELS),
          ]}
        />
        <SelectField
          label="Applied through"
          name="sourcePlatform"
          defaultValue={defaults?.sourcePlatform ?? NO_SELECTION}
          error={errors.sourcePlatform}
          options={[
            { value: NO_SELECTION, label: "Detect from job link" },
            ...optionsFrom(SOURCE_PLATFORMS, SOURCE_PLATFORM_LABELS),
          ]}
        />

        <FormField label="Notes" error={errors.notes} className="sm:col-span-2">
          {(control) => (
            <Textarea
              {...control}
              name="notes"
              rows={3}
              defaultValue={defaults?.notes ?? ""}
            />
          )}
        </FormField>
      </div>

      <div className="flex justify-end gap-2 border-t px-5 py-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {mode === "create"
            ? pending
              ? "Adding…"
              : "Add application"
            : pending
              ? "Saving…"
              : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

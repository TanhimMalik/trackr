"use client";

import { useActionState, useTransition } from "react";
import type { ApplicationFormState } from "@/app/(app)/applications/actions";

type SuccessState = Extract<ApplicationFormState, { ok: true }>;

/**
 * Submits a form to a server action and exposes its errors. Submitting from
 * `onSubmit` (rather than a form action) keeps typed values when validation
 * fails. `prepare` can adjust the data first, e.g. to convert local dates.
 */
export function useFormAction(
  action: (
    state: ApplicationFormState,
    formData: FormData,
  ) => Promise<ApplicationFormState>,
  {
    onSuccess,
    prepare,
  }: {
    onSuccess: (state: SuccessState) => void;
    prepare?: (formData: FormData) => void;
  },
) {
  const [state, dispatch, pending] = useActionState<
    ApplicationFormState,
    FormData
  >(async (previous, formData) => {
    const result = await action(previous, formData);
    if (result?.ok) onSuccess(result);
    return result;
  }, null);
  const [, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    prepare?.(formData);
    startTransition(() => dispatch(formData));
  }

  return {
    onSubmit,
    pending,
    errors: state && !state.ok ? (state.fieldErrors ?? {}) : {},
    formError: state && !state.ok ? state.error : undefined,
  };
}

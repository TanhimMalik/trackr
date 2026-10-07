"use server";

import {
  APPLICATION_STATUS_LABELS,
  type ApplicationStatus,
} from "@trackr/domain";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { applicationFormValues } from "@/lib/applications/form-data";
import {
  createApplicationSchema,
  updateApplicationSchema,
} from "@/lib/applications/input";
import { firstErrorPerField } from "@/lib/forms";
import { requireUser } from "@/server/auth/session";
import {
  changeApplicationStatus,
  createApplication,
  deleteApplication,
  updateApplication,
} from "@/server/services/applications";
import { NotFoundError } from "@/server/services/errors";

export type ApplicationFormState =
  | { ok: true; message: string }
  | { ok: false; error?: string; fieldErrors?: Record<string, string> }
  | null;

// Applications appear across the app (list, board, detail, overview).
function revalidateApplications() {
  revalidatePath("/", "layout");
}

function failure(
  error: unknown,
  notFoundMessage: string,
): ApplicationFormState {
  if (error instanceof ZodError) {
    return { ok: false, fieldErrors: firstErrorPerField(error) };
  }
  if (error instanceof NotFoundError) {
    return { ok: false, error: notFoundMessage };
  }
  console.error("application_action_failed", {
    error: error instanceof Error ? error.name : "unknown",
  });
  return { ok: false, error: "Something went wrong. Try again." };
}

export async function createApplicationAction(
  _state: ApplicationFormState,
  formData: FormData,
): Promise<ApplicationFormState> {
  const user = await requireUser();
  const parsed = createApplicationSchema.safeParse(
    applicationFormValues(formData),
  );
  if (!parsed.success) return failure(parsed.error, "");
  try {
    const application = await createApplication(user.id, parsed.data);
    revalidateApplications();
    return { ok: true, message: `Added ${application.companyName}.` };
  } catch (error) {
    return failure(error, "That resume no longer exists.");
  }
}

export async function updateApplicationAction(
  applicationId: string,
  _state: ApplicationFormState,
  formData: FormData,
): Promise<ApplicationFormState> {
  const user = await requireUser();
  // The edit schema ignores create-only fields such as status.
  const parsed = updateApplicationSchema.safeParse(
    applicationFormValues(formData),
  );
  if (!parsed.success) return failure(parsed.error, "");
  try {
    const application = await updateApplication(
      user.id,
      applicationId,
      parsed.data,
    );
    revalidateApplications();
    return { ok: true, message: `Saved ${application.companyName}.` };
  } catch (error) {
    return failure(error, "This application no longer exists.");
  }
}

export async function deleteApplicationAction(
  applicationId: string,
): Promise<ApplicationFormState> {
  const user = await requireUser();
  try {
    await deleteApplication(user.id, applicationId);
    revalidateApplications();
    return { ok: true, message: "Application deleted." };
  } catch (error) {
    return failure(error, "This application was already deleted.");
  }
}

/** Records a manual status change, for example from dragging a board card. */
export async function changeApplicationStatusAction(
  applicationId: string,
  status: ApplicationStatus,
): Promise<ApplicationFormState> {
  const user = await requireUser();
  try {
    const result = await changeApplicationStatus(
      user.id,
      applicationId,
      status,
    );
    revalidateApplications();
    return {
      ok: true,
      message: result
        ? `Moved to ${APPLICATION_STATUS_LABELS[result.status]}.`
        : `Already in ${APPLICATION_STATUS_LABELS[status]}.`,
    };
  } catch (error) {
    return failure(error, "This application no longer exists.");
  }
}

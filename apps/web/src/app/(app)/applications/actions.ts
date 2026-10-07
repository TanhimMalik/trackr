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
  countApplications,
  createApplication,
  deleteApplication,
  listApplicationSummaries,
  updateApplication,
  type ApplicationSummary,
} from "@/server/services/applications";
import { DEMO_APPLICATION_LIMIT } from "@/server/services/demo-workspace";
import { LastEventError, NotFoundError } from "@/server/services/errors";
import {
  restoreEvent,
  revertEvent,
  type EventChange,
} from "@/server/services/events";

export type ApplicationFormState =
  | {
      ok: true;
      message: string;
      /** The event a status change recorded, so it can be undone. */
      eventId?: string;
    }
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
  if (
    user.isDemo &&
    (await countApplications(user.id)) >= DEMO_APPLICATION_LIMIT
  ) {
    return {
      ok: false,
      error: `Demo workspaces hold up to ${DEMO_APPLICATION_LIMIT} applications.`,
    };
  }
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
      eventId: result?.event.id,
    };
  } catch (error) {
    return failure(error, "This application no longer exists.");
  }
}

/** The signed-in user's applications in brief, for the command palette. */
export async function listApplicationSummariesAction(): Promise<
  ApplicationSummary[]
> {
  const user = await requireUser();
  return listApplicationSummaries(user.id);
}

export type EventChangeState =
  { ok: true; message: string } | { ok: false; error: string };

const statusLabel = (change: EventChange) =>
  APPLICATION_STATUS_LABELS[change.status];

async function changeEvent(
  eventId: string,
  change: (userId: string, eventId: string) => Promise<EventChange>,
  describe: (change: EventChange) => string,
): Promise<EventChangeState> {
  const user = await requireUser();
  try {
    const result = await change(user.id, eventId);
    revalidateApplications();
    return { ok: true, message: describe(result) };
  } catch (error) {
    if (error instanceof LastEventError) {
      return {
        ok: false,
        error: "This is the application's only event, so it can't be undone.",
      };
    }
    if (error instanceof NotFoundError) {
      return { ok: false, error: "This event no longer exists." };
    }
    console.error("event_change_failed", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return { ok: false, error: "Something went wrong. Try again." };
  }
}

/** Undoes an event, such as a status change made by mistake. */
export async function undoEventAction(
  eventId: string,
): Promise<EventChangeState> {
  return changeEvent(eventId, revertEvent, (change) =>
    change.status === change.previousStatus
      ? `Undone. ${change.companyName} stays in ${statusLabel(change)}.`
      : `Undone. ${change.companyName} is back in ${statusLabel(change)}.`,
  );
}

/** Brings back an event that was undone. */
export async function restoreEventAction(
  eventId: string,
): Promise<EventChangeState> {
  return changeEvent(
    eventId,
    restoreEvent,
    (change) => `Restored. ${change.companyName} is in ${statusLabel(change)}.`,
  );
}

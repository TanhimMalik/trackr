"use server";

import {
  INTERVIEW_TYPE_LABELS,
  interviewStatusSchema,
  type InterviewStatus,
} from "@trackr/domain";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import {
  activityFormValues,
  contactFormValues,
  interviewFormValues,
  LOGGABLE_EVENTS,
  type LoggableEventType,
} from "@/lib/applications/details-input";
import { firstErrorPerField } from "@/lib/forms";
import { requireUser } from "@/server/auth/session";
import { logActivity } from "@/server/services/applications";
import {
  createContact,
  deleteContact,
  updateContact,
} from "@/server/services/contacts";
import { DuplicateContactError, NotFoundError } from "@/server/services/errors";
import {
  FitLimitError,
  FitUnavailableError,
  scoreApplication,
} from "@/server/services/fit";
import { LlmUnavailableError } from "@/server/integrations/anthropic";
import {
  createInterview,
  deleteInterview,
  setInterviewStatus,
  updateInterview,
} from "@/server/services/interviews";
import type { ApplicationFormState } from "./actions";

function revalidate() {
  revalidatePath("/", "layout");
}

function failure(error: unknown, notFound: string): ApplicationFormState {
  if (error instanceof ZodError) {
    return { ok: false, fieldErrors: firstErrorPerField(error) };
  }
  if (error instanceof DuplicateContactError) {
    return {
      ok: false,
      fieldErrors: { email: "This person is already a contact." },
    };
  }
  if (error instanceof NotFoundError) return { ok: false, error: notFound };
  console.error("detail_action_failed", {
    error: error instanceof Error ? error.name : "unknown",
  });
  return { ok: false, error: "Something went wrong. Try again." };
}

const GONE = "This application no longer exists.";

export async function logActivityAction(
  applicationId: string,
  _state: ApplicationFormState,
  formData: FormData,
): Promise<ApplicationFormState> {
  const user = await requireUser();
  try {
    const result = await logActivity(
      user.id,
      applicationId,
      activityFormValues(formData),
    );
    revalidate();
    const label = LOGGABLE_EVENTS[result.event.eventType as LoggableEventType];
    return {
      ok: true,
      message: `Logged "${label ?? "activity"}".`,
      eventId: result.event.id,
    };
  } catch (error) {
    return failure(error, GONE);
  }
}

export async function createContactAction(
  applicationId: string,
  _state: ApplicationFormState,
  formData: FormData,
): Promise<ApplicationFormState> {
  const user = await requireUser();
  try {
    const contact = await createContact(
      user.id,
      applicationId,
      contactFormValues(formData),
    );
    revalidate();
    return { ok: true, message: `Added ${contact.name}.` };
  } catch (error) {
    return failure(error, GONE);
  }
}

export async function updateContactAction(
  contactId: string,
  _state: ApplicationFormState,
  formData: FormData,
): Promise<ApplicationFormState> {
  const user = await requireUser();
  try {
    const contact = await updateContact(
      user.id,
      contactId,
      contactFormValues(formData),
    );
    revalidate();
    return { ok: true, message: `Saved ${contact.name}.` };
  } catch (error) {
    return failure(error, "This contact no longer exists.");
  }
}

export async function deleteContactAction(
  contactId: string,
): Promise<ApplicationFormState> {
  const user = await requireUser();
  try {
    await deleteContact(user.id, contactId);
    revalidate();
    return { ok: true, message: "Contact removed." };
  } catch (error) {
    return failure(error, "This contact no longer exists.");
  }
}

const interviewName = (type: keyof typeof INTERVIEW_TYPE_LABELS) =>
  INTERVIEW_TYPE_LABELS[type].toLowerCase();

export async function createInterviewAction(
  applicationId: string,
  _state: ApplicationFormState,
  formData: FormData,
): Promise<ApplicationFormState> {
  const user = await requireUser();
  try {
    const interview = await createInterview(
      user.id,
      applicationId,
      interviewFormValues(formData),
    );
    revalidate();
    return {
      ok: true,
      message: `Added the ${interviewName(interview.interviewType)}.`,
    };
  } catch (error) {
    return failure(error, GONE);
  }
}

export async function updateInterviewAction(
  interviewId: string,
  _state: ApplicationFormState,
  formData: FormData,
): Promise<ApplicationFormState> {
  const user = await requireUser();
  try {
    const interview = await updateInterview(
      user.id,
      interviewId,
      interviewFormValues(formData),
    );
    revalidate();
    return {
      ok: true,
      message: `Saved the ${interviewName(interview.interviewType)}.`,
    };
  } catch (error) {
    return failure(error, "This interview no longer exists.");
  }
}

const STATUS_MESSAGES: Record<InterviewStatus, string> = {
  SCHEDULED: "Marked as scheduled.",
  COMPLETED: "Marked as completed.",
  CANCELED: "Marked as canceled.",
};

export async function setInterviewStatusAction(
  interviewId: string,
  status: InterviewStatus,
): Promise<ApplicationFormState> {
  const user = await requireUser();
  try {
    const parsed = interviewStatusSchema.parse(status);
    await setInterviewStatus(user.id, interviewId, parsed);
    revalidate();
    return { ok: true, message: STATUS_MESSAGES[parsed] };
  } catch (error) {
    return failure(error, "This interview no longer exists.");
  }
}

export async function deleteInterviewAction(
  interviewId: string,
): Promise<ApplicationFormState> {
  const user = await requireUser();
  try {
    await deleteInterview(user.id, interviewId);
    revalidate();
    return { ok: true, message: "Interview removed." };
  } catch (error) {
    return failure(error, "This interview no longer exists.");
  }
}

/** Scores how well the job fits the person's resume profile, now. */
export async function scoreFitAction(
  applicationId: string,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const user = await requireUser();
  if (user.isDemo) {
    return {
      ok: false,
      error: "Scoring new jobs needs an account. The saved jobs show examples.",
    };
  }
  try {
    const fit = await scoreApplication(user.id, applicationId);
    if (!fit) {
      return {
        ok: false,
        error: "Add the job description and your resume first.",
      };
    }
    revalidatePath("/", "layout");
    return { ok: true, message: `Scored ${fit.score} out of 100.` };
  } catch (error) {
    if (error instanceof FitLimitError) {
      return { ok: false, error: "That's the scoring limit for today." };
    }
    if (error instanceof FitUnavailableError) {
      return { ok: false, error: "Fit scoring isn't set up on this site." };
    }
    if (error instanceof LlmUnavailableError) {
      return { ok: false, error: "Claude didn't answer. Try again shortly." };
    }
    if (error instanceof NotFoundError) {
      return { ok: false, error: "This application no longer exists." };
    }
    throw error;
  }
}

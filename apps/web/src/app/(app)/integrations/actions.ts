"use server";

import type { SubmissionOutcome } from "@trackr/domain";
import { revalidatePath } from "next/cache";
import type { ApplicationFormState } from "@/app/(app)/applications/actions";
import { requireUser } from "@/server/auth/session";
import { DEMO_CAPTURES } from "@/server/demo/captures";
import { NotFoundError } from "@/server/services/errors";
import { revokeExtensionSession } from "@/server/services/extension-auth";
import { ingestExtensionSubmission } from "@/server/services/extension-ingestion";

export async function disconnectBrowserAction(
  sessionId: string,
): Promise<ApplicationFormState> {
  const user = await requireUser();
  try {
    await revokeExtensionSession(user.id, sessionId);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return { ok: false, error: "This browser is already disconnected." };
    }
    throw error;
  }
  revalidatePath("/integrations");
  return { ok: true, message: "Browser disconnected." };
}

export type SimulatedCaptureResult =
  | {
      ok: true;
      message: string;
      href: string;
      outcome: SubmissionOutcome;
    }
  | { ok: false; error: string };

const CAPTURE_MESSAGES: Record<SubmissionOutcome, (company: string) => string> =
  {
    CREATED: (company) => `${company} was added to your board as Applied.`,
    MATCHED_EXISTING: (company) =>
      `Matched your saved ${company} application and marked it Applied.`,
    POSSIBLE_DUPLICATE: (company) =>
      `Added ${company}, and asked whether it duplicates the one you track.`,
  };

/**
 * Demo only: sends a sample submission through the same pipeline the
 * extension uses, so visitors can see it work without installing anything.
 */
export async function simulateCaptureAction(
  captureId: string,
): Promise<SimulatedCaptureResult> {
  const user = await requireUser();
  const capture = DEMO_CAPTURES.find((item) => item.id === captureId);
  if (!user.isDemo || !capture) {
    return { ok: false, error: "Simulated captures are only in the demo." };
  }

  const { applicationId, outcome } = await ingestExtensionSubmission(user.id, {
    clientSubmissionId: crypto.randomUUID(),
    captureMode: capture.captureMode,
    platform: capture.platform,
    companyName: capture.companyName,
    jobTitle: capture.jobTitle,
    jobUrl: capture.jobUrl,
    location: capture.location,
    submittedAt: new Date().toISOString(),
  });
  revalidatePath("/", "layout");
  return {
    ok: true,
    outcome,
    message: CAPTURE_MESSAGES[outcome](capture.companyName),
    href:
      outcome === "POSSIBLE_DUPLICATE"
        ? "/activity?tab=review"
        : `/applications/${applicationId}`,
  };
}

"use server";

import type { SubmissionOutcome } from "@trackr/domain";
import { revalidatePath } from "next/cache";
import type { ApplicationFormState } from "@/app/(app)/applications/actions";
import { requireUser } from "@/server/auth/session";
import { DEMO_CAPTURES } from "@/server/demo/captures";
import { NotFoundError } from "@/server/services/errors";
import { revokeExtensionSession } from "@/server/services/extension-auth";
import { ingestExtensionSubmission } from "@/server/services/extension-ingestion";
import {
  GmailApiDisabledError,
  GmailTemporaryError,
} from "@/server/integrations/gmail-api";
import {
  disconnectGmail,
  GmailNotConnectedError,
  GmailReauthRequiredError,
} from "@/server/services/gmail-connection";
import {
  GmailNotConfiguredError,
  GmailSyncBusyError,
  restartGmailSync,
  syncGmail,
  type SyncResult,
} from "@/server/services/gmail-sync";

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

export async function disconnectGmailAction(): Promise<ApplicationFormState> {
  const user = await requireUser();
  await disconnectGmail(user.id);
  revalidatePath("/integrations");
  return {
    ok: true,
    message: "Gmail disconnected. Trackr's access was revoked.",
  };
}

export type GmailSyncState =
  | {
      ok: true;
      processed: number;
      hasMore: boolean;
      outcomes: SyncResult["outcomes"];
    }
  | { ok: false; error: string };

/** Reads the next batch of Gmail. The page calls it again while `hasMore`. */
export async function syncGmailAction(): Promise<GmailSyncState> {
  const user = await requireUser();
  if (user.isDemo) {
    return {
      ok: false,
      error: "Gmail needs a real account, not a demo workspace.",
    };
  }
  try {
    const result = await syncGmail(user.id);
    if (!result.hasMore) revalidatePath("/", "layout");
    return { ok: true, ...result };
  } catch (error) {
    revalidatePath("/integrations");
    if (error instanceof GmailSyncBusyError) {
      return {
        ok: false,
        error: "A sync is already running. Try again in a minute.",
      };
    }
    if (error instanceof GmailReauthRequiredError) {
      return {
        ok: false,
        error: "Google ended Trackr's access. Reconnect Gmail to keep syncing.",
      };
    }
    if (error instanceof GmailApiDisabledError) {
      return {
        ok: false,
        error:
          "The Gmail API isn't enabled for this app's Google Cloud project.",
      };
    }
    if (error instanceof GmailNotConnectedError) {
      return { ok: false, error: "Gmail isn't connected." };
    }
    if (error instanceof GmailNotConfiguredError) {
      return { ok: false, error: "Gmail isn't set up on this deployment." };
    }
    if (error instanceof GmailTemporaryError) {
      return {
        ok: false,
        error: "Gmail is busy right now. Try again in a minute.",
      };
    }
    console.error("gmail_sync_failed", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return {
      ok: false,
      error: "Something went wrong syncing Gmail. Try again.",
    };
  }
}

/** Clears undecided emails so the next sync reads the last 90 days again. */
export async function restartGmailSyncAction(): Promise<ApplicationFormState> {
  const user = await requireUser();
  if (user.isDemo) return { ok: false, error: "Gmail needs a real account." };
  try {
    await restartGmailSync(user.id);
  } catch (error) {
    if (error instanceof GmailSyncBusyError) {
      return {
        ok: false,
        error: "A sync is running. Try again when it finishes.",
      };
    }
    if (error instanceof GmailNotConnectedError) {
      return { ok: false, error: "Gmail isn't connected." };
    }
    throw error;
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Re-checking the last 90 days." };
}

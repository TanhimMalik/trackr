import { revalidatePath } from "next/cache";
import { after, NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import {
  FitLimitError,
  FitUnavailableError,
  RESUME_MAX_BYTES,
  ResumeUnreadableError,
  saveResumeProfile,
  scoreUnscoredApplications,
} from "@/server/services/fit";

// Reading a resume takes the model a few seconds; scoring follows after.
export const maxDuration = 60;

const failure = (status: number, error: string) =>
  NextResponse.json(
    { ok: false, error },
    { status, headers: { "cache-control": "no-store" } },
  );

/**
 * Reads an uploaded resume PDF into a profile, then scores applications
 * against it in the background. The file itself is never stored.
 */
export async function POST(request: Request) {
  // Forms on other sites can post here too; only Trackr's own pages may.
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return failure(403, "Upload from Trackr's settings page.");
  }
  const user = await getCurrentUser();
  if (!user) return failure(401, "Sign in to add your resume.");
  if (user.isDemo) {
    return failure(
      403,
      "The demo uses a sample resume. Create an account to add yours.",
    );
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("resume");
  if (!(file instanceof File) || file.size === 0) {
    return failure(400, "Choose a PDF of your resume.");
  }
  if (file.size > RESUME_MAX_BYTES) {
    return failure(400, "That file is over 4 MB. Export a smaller PDF.");
  }

  try {
    const record = await saveResumeProfile(user.id, {
      pdf: Buffer.from(await file.arrayBuffer()),
      filename: file.name,
    });
    after(async () => {
      try {
        await scoreUnscoredApplications(user.id);
      } catch (error) {
        console.error("fit_batch_failed", {
          error: error instanceof Error ? error.name : "unknown",
        });
      }
    });
    revalidatePath("/", "layout");
    return NextResponse.json(
      { ok: true, skills: record.profile.skills.length },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof ResumeUnreadableError) {
      return failure(
        400,
        error.reason === "not_pdf"
          ? "That isn't a PDF. Export your resume as a PDF and try again."
          : error.reason === "too_large"
            ? "That file is over 4 MB. Export a smaller PDF."
            : "Claude couldn't read that resume. Try a PDF with selectable text.",
      );
    }
    if (error instanceof FitLimitError) {
      return failure(429, "That's enough resumes for today. Try tomorrow.");
    }
    if (error instanceof FitUnavailableError) {
      return failure(503, "Fit scoring isn't set up on this site.");
    }
    console.error("resume_upload_failed", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return failure(500, "Something went wrong reading your resume. Try again.");
  }
}

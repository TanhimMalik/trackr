"use server";

import { revalidatePath } from "next/cache";
import type { ApplicationFormState } from "@/app/(app)/applications/actions";
import { requireUser } from "@/server/auth/session";
import { NotFoundError } from "@/server/services/errors";
import { ZodError } from "zod";
import { firstErrorPerField } from "@/lib/forms";
import {
  applyEmailReview,
  createApplicationFromEmail,
  dismissEmailReview,
  keepBoth,
  mergeDuplicate,
} from "@/server/services/review";

const RESOLVED = "This was already resolved.";

export async function mergeDuplicateAction(
  itemId: string,
): Promise<ApplicationFormState> {
  const user = await requireUser();
  try {
    await mergeDuplicate(user.id, itemId);
  } catch (error) {
    if (error instanceof NotFoundError) return { ok: false, error: RESOLVED };
    throw error;
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Merged into the existing application." };
}

export async function keepBothAction(
  itemId: string,
): Promise<ApplicationFormState> {
  const user = await requireUser();
  try {
    await keepBoth(user.id, itemId);
  } catch (error) {
    if (error instanceof NotFoundError) return { ok: false, error: RESOLVED };
    throw error;
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Kept both applications." };
}

export async function applyEmailReviewAction(
  itemId: string,
): Promise<ApplicationFormState> {
  const user = await requireUser();
  try {
    await applyEmailReview(user.id, itemId);
  } catch (error) {
    if (error instanceof NotFoundError) return { ok: false, error: RESOLVED };
    throw error;
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Update applied." };
}

export async function createApplicationFromEmailAction(
  itemId: string,
  input: { companyName: string; jobTitle: string },
): Promise<ApplicationFormState> {
  const user = await requireUser();
  try {
    await createApplicationFromEmail(user.id, itemId, input);
  } catch (error) {
    if (error instanceof NotFoundError) return { ok: false, error: RESOLVED };
    if (error instanceof ZodError) {
      return { ok: false, fieldErrors: firstErrorPerField(error) };
    }
    throw error;
  }
  revalidatePath("/", "layout");
  return {
    ok: true,
    message: `Added ${input.companyName.trim()} to your board.`,
  };
}

export async function dismissEmailReviewAction(
  itemId: string,
): Promise<ApplicationFormState> {
  const user = await requireUser();
  try {
    await dismissEmailReview(user.id, itemId);
  } catch (error) {
    if (error instanceof NotFoundError) return { ok: false, error: RESOLVED };
    throw error;
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Dismissed." };
}

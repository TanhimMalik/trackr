"use server";

import { revalidatePath } from "next/cache";
import type { ApplicationFormState } from "@/app/(app)/applications/actions";
import { requireUser } from "@/server/auth/session";
import { NotFoundError } from "@/server/services/errors";
import { keepBoth, mergeDuplicate } from "@/server/services/review";

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

"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireUser } from "@/server/auth/session";
import {
  updateFollowUpSettings,
  type FollowUpSettings,
} from "@/server/services/settings";

export type SettingsState =
  | { ok: true; message: string; settings: FollowUpSettings }
  | { ok: false; error: string };

export async function updateFollowUpSettingsAction(
  input: FollowUpSettings,
): Promise<SettingsState> {
  const user = await requireUser();
  try {
    const settings = await updateFollowUpSettings(user.id, input);
    revalidatePath("/", "layout");
    return {
      ok: true,
      message: settings.enabled
        ? `Reminders after ${settings.afterDays} days of silence.`
        : "Follow-up reminders turned off.",
      settings,
    };
  } catch (error) {
    if (error instanceof ZodError) {
      return { ok: false, error: "Pick one of the offered intervals." };
    }
    console.error("settings_update_failed", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return { ok: false, error: "Couldn't save your settings. Try again." };
  }
}

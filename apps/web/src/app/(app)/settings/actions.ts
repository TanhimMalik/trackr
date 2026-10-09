"use server";

import type { AutomationSettings } from "@trackr/domain";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { requireUser } from "@/server/auth/session";
import { endSupabaseSession } from "@/server/auth/supabase";
import { deleteAccount, deleteEmailData } from "@/server/services/privacy";
import {
  setAutoTrackSupportedSites,
  setEmailAutomation,
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

export async function setAutoTrackAction(
  enabled: boolean,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const user = await requireUser();
  try {
    const value = await setAutoTrackSupportedSites(user.id, enabled);
    revalidatePath("/settings");
    return {
      ok: true,
      message: value
        ? "The extension will track applications as you submit them."
        : "The extension will only track jobs you add from its popup.",
    };
  } catch {
    return { ok: false, error: "Couldn't save your settings. Try again." };
  }
}

export async function setEmailAutomationAction(
  settings: AutomationSettings,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const user = await requireUser();
  try {
    const saved = await setEmailAutomation(user.id, settings);
    revalidatePath("/settings");
    return {
      ok: true,
      message: !saved.autoUpdateEnabled
        ? "Every update from email will wait for you to confirm it."
        : saved.askBeforeMediumConfidence
          ? "Only near-certain updates will be applied on their own."
          : "Clear updates from email will be applied automatically.",
    };
  } catch {
    return { ok: false, error: "Couldn't save your settings. Try again." };
  }
}

export async function deleteEmailDataAction(): Promise<
  { ok: true; message: string } | { ok: false; error: string }
> {
  const user = await requireUser();
  try {
    const { emails } = await deleteEmailData(user.id);
    revalidatePath("/", "layout");
    return {
      ok: true,
      message: `Deleted ${emails} stored email${emails === 1 ? "" : "s"}. Applications and their history are unchanged.`,
    };
  } catch (error) {
    console.error("email_data_delete_failed", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return { ok: false, error: "Couldn't delete your email data. Try again." };
  }
}

/** Deletes the account and everything in it, then signs out. */
export async function deleteAccountAction(
  confirmation: string,
): Promise<{ ok: false; error: string }> {
  const user = await requireUser();
  if (user.isDemo) {
    return { ok: false, error: "End the demo from the banner instead." };
  }
  if (confirmation.trim().toLowerCase() !== "delete") {
    return { ok: false, error: "Type delete to confirm." };
  }
  try {
    await deleteAccount(user.id);
  } catch (error) {
    console.error("account_delete_failed", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return { ok: false, error: "Couldn't delete your account. Try again." };
  }
  await endSupabaseSession();
  redirect("/?account=deleted");
}

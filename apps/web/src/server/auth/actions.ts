"use server";

import { redirect } from "next/navigation";
import {
  authErrorMessage,
  fieldErrors,
  signInSchema,
  signUpSchema,
  type AuthFormState,
} from "@/lib/auth/forms";
import { SIGN_IN_PATH, safeRedirectPath } from "@/lib/auth/routes";
import { publicEnv } from "@/lib/env";
import { upsertUser } from "@/server/services/users";
import { sessionUserFromAuthUser } from "./session";
import { createSupabaseServerClient } from "./supabase";

const text = (formData: FormData, name: string) =>
  String(formData.get(name) ?? "");

export async function signIn(
  _state: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const values = { email: text(formData, "email") };
  const parsed = signInSchema.safeParse({
    email: values.email,
    password: text(formData, "password"),
  });
  if (!parsed.success) {
    return { fieldErrors: fieldErrors(parsed.error), values };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    return { error: authErrorMessage(error?.code), values };
  }

  await upsertUser(sessionUserFromAuthUser(data.user));
  redirect(safeRedirectPath(formData.get("next")));
}

export async function signUp(
  _state: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const values = {
    name: text(formData, "name"),
    email: text(formData, "email"),
  };
  const parsed = signUpSchema.safeParse({
    ...values,
    password: text(formData, "password"),
  });
  if (!parsed.success) {
    return { fieldErrors: fieldErrors(parsed.error), values };
  }

  const { name, email, password } = parsed.data;
  const next = safeRedirectPath(formData.get("next"));
  // The confirmation link returns through the callback, which continues to `next`.
  const confirmationUrl = new URL(
    "/auth/callback",
    publicEnv().NEXT_PUBLIC_APP_URL,
  );
  confirmationUrl.searchParams.set("next", next);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: name ? { name } : {},
      emailRedirectTo: confirmationUrl.toString(),
    },
  });
  if (error) {
    return { error: authErrorMessage(error.code), values };
  }

  // With email confirmation disabled, Supabase signs the user in immediately.
  if (data.session && data.user) {
    await upsertUser(sessionUserFromAuthUser(data.user));
    redirect(next);
  }

  return {
    notice: `We sent a confirmation link to ${email}. Open it to finish creating your account.`,
  };
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect(SIGN_IN_PATH);
}

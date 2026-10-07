import { z } from "zod";

// Supabase hashes passwords with bcrypt, which only reads the first 72 bytes.
const password = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(72, "Use at most 72 characters.");

// Trim before validating so pasted addresses with stray spaces are accepted.
const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address."));

export const signInSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password."),
});

export const signUpSchema = z.object({
  name: z
    .string()
    .trim()
    .max(100, "Use at most 100 characters.")
    .transform((value) => value || null),
  email,
  password,
});

export type AuthFormState =
  | {
      error?: string;
      fieldErrors?: Partial<Record<"name" | "email" | "password", string>>;
      /** Shown after sign-up when the email address must be confirmed first. */
      notice?: string;
      /** Echoed back so the form keeps what the user typed. */
      values?: { name?: string; email?: string };
    }
  | undefined;

/** The first message for each invalid field. */
export function fieldErrors(
  error: z.ZodError,
): NonNullable<AuthFormState>["fieldErrors"] {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0]);
    result[field] ??= issue.message;
  }
  return result;
}

/**
 * User-facing wording for Supabase Auth error codes. Unknown codes get a
 * generic message; sign-in failures never reveal whether an account exists.
 */
export function authErrorMessage(code: string | undefined): string {
  switch (code) {
    case "invalid_credentials":
      return "Incorrect email or password.";
    case "email_not_confirmed":
      return "Confirm your email address first. Check your inbox for the link.";
    case "user_already_exists":
    case "email_exists":
      return "An account with this email already exists. Sign in instead.";
    case "weak_password":
      return "Choose a stronger password.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Too many attempts. Wait a minute and try again.";
    case "signup_disabled":
      return "New sign-ups are currently disabled.";
    default:
      return "Something went wrong. Try again.";
  }
}

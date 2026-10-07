"use client";

import { CircleCheck } from "lucide-react";
import Link from "next/link";
import { useActionState, useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuthFormState } from "@/lib/auth/forms";
import { signIn, signUp } from "@/server/auth/actions";

type Mode = "sign-in" | "sign-up";

const COPY = {
  "sign-in": {
    submit: "Sign in",
    pending: "Signing in…",
    switchPrompt: "Don't have an account?",
    switchLabel: "Create one",
    switchHref: "/signup",
  },
  "sign-up": {
    submit: "Create account",
    pending: "Creating account…",
    switchPrompt: "Already have an account?",
    switchLabel: "Sign in",
    switchHref: "/login",
  },
} satisfies Record<Mode, Record<string, string>>;

function Field({
  label,
  hint,
  error,
  ...input
}: React.ComponentProps<typeof Input> & {
  label: string;
  hint?: string;
  error?: string;
}) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...input}
      />
      {error ? (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function AuthForm({ mode, next }: { mode: Mode; next?: string }) {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    mode === "sign-in" ? signIn : signUp,
    undefined,
  );
  const copy = COPY[mode];
  const switchHref = next
    ? `${copy.switchHref}?next=${encodeURIComponent(next)}`
    : copy.switchHref;

  if (state?.notice) {
    return (
      <div
        role="status"
        className="flex flex-col items-center gap-3 text-center"
      >
        <CircleCheck className="size-8 text-success" aria-hidden="true" />
        <p>{state.notice}</p>
        <Button variant="outline" asChild>
          <Link href="/login">Back to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} noValidate className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}

      {state?.error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive"
        >
          {state.error}
        </p>
      )}

      {mode === "sign-up" && (
        <Field
          label="Name"
          name="name"
          autoComplete="name"
          defaultValue={state?.values?.name}
          error={state?.fieldErrors?.name}
          hint="Optional"
        />
      )}
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state?.values?.email}
        error={state?.fieldErrors?.email}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
        required
        error={state?.fieldErrors?.password}
        hint={mode === "sign-up" ? "At least 8 characters" : undefined}
      />

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? copy.pending : copy.submit}
      </Button>

      <p className="text-center text-muted-foreground">
        {copy.switchPrompt}{" "}
        <Link
          href={switchHref}
          className="font-medium text-primary-text underline-offset-4 hover:underline"
        >
          {copy.switchLabel}
        </Link>
      </p>
    </form>
  );
}

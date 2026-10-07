import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold tracking-tight">Sign in</h1>
        <p className="text-muted-foreground">
          Welcome back to your job search.
        </p>
      </div>
      {error === "confirmation" && (
        <p
          role="alert"
          className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2"
        >
          That confirmation link is invalid or has expired. Sign in, or create
          your account again to get a new link.
        </p>
      )}
      <AuthForm
        mode="sign-in"
        next={typeof next === "string" ? next : undefined}
      />
    </div>
  );
}

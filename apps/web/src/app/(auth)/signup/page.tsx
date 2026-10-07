import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = { title: "Create account" };

export default async function SignUpPage({
  searchParams,
}: PageProps<"/signup">) {
  const { next } = await searchParams;

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold tracking-tight">
          Create your account
        </h1>
        <p className="text-muted-foreground">
          Track every application without maintaining a spreadsheet.
        </p>
      </div>
      <AuthForm
        mode="sign-up"
        next={typeof next === "string" ? next : undefined}
      />
    </div>
  );
}

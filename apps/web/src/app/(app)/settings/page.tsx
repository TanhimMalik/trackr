import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { ThemeSelect } from "@/components/settings/theme-select";
import { requireUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Settings"
        description="Manage your account and preferences."
      />

      <section className="rounded-xl border bg-card">
        <div className="space-y-0.5 border-b p-4">
          <h2 className="font-semibold">Account</h2>
          <p className="text-muted-foreground">
            The details you signed up with.
          </p>
        </div>
        <dl className="divide-y">
          <div className="grid gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr]">
            <dt className="text-muted-foreground">Name</dt>
            <dd>{user.name ?? "—"}</dd>
          </div>
          <div className="grid gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr]">
            <dt className="text-muted-foreground">Email</dt>
            <dd>{user.email}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border bg-card">
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-0.5">
            <h2 className="font-semibold">Appearance</h2>
            <p className="text-muted-foreground">
              Choose how Trackr looks on this device.
            </p>
          </div>
          <ThemeSelect />
        </div>
      </section>
    </div>
  );
}

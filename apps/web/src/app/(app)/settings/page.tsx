import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { ThemeSelect } from "@/components/settings/theme-select";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Settings"
        description="Manage your account and preferences."
      />
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

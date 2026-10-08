import { Puzzle } from "lucide-react";
import type { Metadata } from "next";
import { ConnectedBrowsers } from "@/components/integrations/connected-browsers";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/server/auth/session";
import { listConnectedBrowsers } from "@/server/services/extension-auth";

export const metadata: Metadata = { title: "Integrations" };

export default async function IntegrationsPage() {
  const user = await requireUser();
  const browsers = await listConnectedBrowsers(user.id);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Integrations"
        description="Connections that keep your applications up to date on their own."
      />

      <section
        aria-labelledby="extension-heading"
        className="rounded-xl border bg-card"
      >
        <div className="flex items-start gap-3 border-b p-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-text">
            <Puzzle className="size-4" aria-hidden="true" />
          </span>
          <div className="space-y-0.5">
            <h2 id="extension-heading" className="font-semibold">
              Browser extension
            </h2>
            <p className="text-muted-foreground">
              Adds applications as you submit them on Greenhouse, Lever and
              Ashby. It only runs on those sites and sends nothing until you
              apply.
            </p>
          </div>
        </div>
        <ConnectedBrowsers browsers={browsers} />
      </section>
    </div>
  );
}

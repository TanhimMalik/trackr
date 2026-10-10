import { ExternalLink, Inbox, Puzzle, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import { ConnectedBrowsers } from "@/components/integrations/connected-browsers";
import {
  GmailCard,
  type GmailCardState,
} from "@/components/integrations/gmail-card";
import { SimulateCaptures } from "@/components/integrations/simulate-captures";
import { SimulateEmails } from "@/components/integrations/simulate-emails";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/server/auth/session";
import { DEMO_CAPTURES } from "@/server/demo/captures";
import { DEMO_EMAILS } from "@/server/demo/emails";
import { googleOAuthConfig } from "@/server/env";
import { listConnectedBrowsers } from "@/server/services/extension-auth";
import { getGmailConnection } from "@/server/services/gmail-connection";

export const metadata: Metadata = { title: "Integrations" };

// The extension isn't in the Chrome Web Store; the README explains loading it.
const INSTALL_URL = "https://github.com/TanhimMalik/trackr#browser-extension";

export default async function IntegrationsPage({
  searchParams,
}: PageProps<"/integrations">) {
  const user = await requireUser();
  const [browsers, gmail, params] = await Promise.all([
    listConnectedBrowsers(user.id),
    getGmailConnection(user.id),
    searchParams,
  ]);
  const gmailState: GmailCardState = !googleOAuthConfig()
    ? { kind: "unavailable" }
    : user.isDemo
      ? { kind: "demo" }
      : {
          kind: "account",
          status: gmail?.status ?? null,
          email: gmail?.email ?? null,
          connectedAt: gmail?.connectedAt ?? null,
          lastSyncedAt: gmail?.lastSyncedAt ?? null,
          lastErrorCode: gmail?.lastErrorCode ?? null,
        };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Integrations"
        description="Connections that keep your applications up to date on their own."
      />

      {user.isDemo && (
        <section
          aria-labelledby="simulate-heading"
          className="rounded-xl border border-primary/30 bg-card"
        >
          <div className="flex items-start gap-3 border-b p-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-text">
              <Sparkles className="size-4" aria-hidden="true" />
            </span>
            <div className="space-y-0.5">
              <h2 id="simulate-heading" className="font-semibold">
                Try the extension without installing it
              </h2>
              <p className="text-muted-foreground">
                Each one sends a sample application through the same pipeline
                the extension uses: matching, duplicate checks and all. It
                changes this demo&apos;s data; Reset data puts it back.
              </p>
            </div>
          </div>
          <SimulateCaptures
            captures={DEMO_CAPTURES.map(({ id, title, description }) => ({
              id,
              title,
              description,
            }))}
          />
        </section>
      )}

      {user.isDemo && (
        <section
          aria-labelledby="inbox-heading"
          className="rounded-xl border border-primary/30 bg-card"
        >
          <div className="flex items-start gap-3 border-b p-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-text">
              <Inbox className="size-4" aria-hidden="true" />
            </span>
            <div className="space-y-0.5">
              <h2 id="inbox-heading" className="font-semibold">
                Try Gmail sync with a sample inbox
              </h2>
              <p className="text-muted-foreground">
                Deliver a sample email and Trackr reads it the way it reads
                Gmail: it decides whether it&apos;s about a job, what happened,
                and which application it belongs to. It changes this demo&apos;s
                data; Reset data puts it back.
              </p>
            </div>
          </div>
          <SimulateEmails
            emails={DEMO_EMAILS.map(
              ({ id, fromName, subject, body, expect }) => ({
                id,
                fromName,
                subject,
                body,
                expect,
              }),
            )}
          />
        </section>
      )}

      <GmailCard
        state={gmailState}
        result={typeof params.gmail === "string" ? params.gmail : null}
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
            <a
              href={INSTALL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[0.8125rem] text-primary-text underline-offset-4 hover:underline"
            >
              How to install it
              <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          </div>
        </div>
        <ConnectedBrowsers browsers={browsers} />
      </section>
    </div>
  );
}

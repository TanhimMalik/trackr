"use client";

import type { IntegrationStatus } from "@trackr/domain";
import { Mail, TriangleAlert, Unplug } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { disconnectGmailAction } from "@/app/(app)/integrations/actions";
import { DateText } from "@/components/date-text";
import { ConfirmDeleteDialog } from "@/components/forms/confirm-delete-dialog";
import { Button } from "@/components/ui/button";

export type GmailCardState =
  | { kind: "unavailable" }
  | { kind: "demo" }
  | {
      kind: "account";
      status: IntegrationStatus | null;
      email: string | null;
      connectedAt: Date | null;
      lastSyncedAt: Date | null;
    };

const RESULT_MESSAGES: Record<
  string,
  { tone: "success" | "error"; text: string }
> = {
  connected: { tone: "success", text: "Gmail connected." },
  denied: {
    tone: "error",
    text: "Gmail wasn't connected: access was declined on Google's screen.",
  },
  missing_scope: {
    tone: "error",
    text: "Gmail wasn't connected: Trackr needs permission to read your email. Connect again and leave the Gmail box checked.",
  },
  expired: {
    tone: "error",
    text: "That sign-in attempt expired. Connect again.",
  },
  error: {
    tone: "error",
    text: "Something went wrong connecting Gmail. Try again.",
  },
  unavailable: {
    tone: "error",
    text: "Gmail isn't set up on this deployment.",
  },
  demo: {
    tone: "error",
    text: "Gmail needs a real account, not a demo workspace.",
  },
};

const CONNECT_HREF = "/api/integrations/gmail/connect";

export function GmailCard({
  state,
  result,
}: {
  state: GmailCardState;
  result: string | null;
}) {
  const [confirming, setConfirming] = useState(false);
  const message = result ? RESULT_MESSAGES[result] : undefined;

  return (
    <section
      aria-labelledby="gmail-heading"
      className="rounded-xl border bg-card"
    >
      <div className="flex items-start gap-3 border-b p-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-text">
          <Mail className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1 space-y-0.5">
          <h2 id="gmail-heading" className="font-semibold">
            Gmail
          </h2>
          <p className="text-muted-foreground">
            Reads confirmations, interview invites and rejections to update
            applications for you. Access is read-only; Trackr keeps the sender,
            subject and what it found, never the message itself.
          </p>
        </div>
      </div>

      {message && (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={
            message.tone === "error"
              ? "border-b bg-destructive/10 px-4 py-2.5 text-destructive"
              : "border-b bg-success/10 px-4 py-2.5 text-success"
          }
        >
          {message.text}
        </p>
      )}

      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <GmailStatus state={state} />
        {state.kind === "account" &&
          (state.status === "CONNECTED" ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirming(true)}
            >
              <Unplug aria-hidden="true" />
              Disconnect
            </Button>
          ) : (
            <Button size="sm" asChild>
              {/* A full navigation: the route redirects to Google. */}
              <a href={CONNECT_HREF}>
                {state.status === "NEEDS_REAUTH"
                  ? "Reconnect Gmail"
                  : "Connect Gmail"}
              </a>
            </Button>
          ))}
        {state.kind === "demo" && (
          <Button variant="outline" size="sm" asChild>
            <Link href="/signup">Create an account</Link>
          </Button>
        )}
      </div>

      <ConfirmDeleteDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Disconnect Gmail?"
        description="Trackr's access is revoked at Google and it stops reading new email. Applications and their history stay as they are."
        confirmLabel="Disconnect"
        pendingLabel="Disconnecting…"
        onConfirm={disconnectGmailAction}
      />
    </section>
  );
}

function GmailStatus({ state }: { state: GmailCardState }) {
  if (state.kind === "unavailable") {
    return (
      <p className="text-muted-foreground">
        Gmail isn&apos;t set up on this deployment.
      </p>
    );
  }
  if (state.kind === "demo") {
    return (
      <p className="text-muted-foreground">
        Connecting Gmail needs an account; demo workspaces can&apos;t.
      </p>
    );
  }
  if (state.status === "CONNECTED") {
    return (
      <div className="min-w-0">
        <p className="truncate font-medium">
          Connected{state.email ? ` as ${state.email}` : ""}
        </p>
        <p className="text-[0.8125rem] text-muted-foreground">
          {state.lastSyncedAt ? (
            <>
              Last checked <DateText date={state.lastSyncedAt} relative />
            </>
          ) : state.connectedAt ? (
            <>
              Connected <DateText date={state.connectedAt} />
            </>
          ) : null}
        </p>
      </div>
    );
  }
  if (state.status === "NEEDS_REAUTH") {
    return (
      <p className="flex items-start gap-2 text-warning">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        Google ended Trackr&apos;s access. Reconnect to keep applications up to
        date.
      </p>
    );
  }
  return <p className="text-muted-foreground">Not connected.</p>;
}

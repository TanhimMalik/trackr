"use client";

import type { IntegrationStatus } from "@trackr/domain";
import { Mail, RefreshCw, TriangleAlert, Unplug } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  disconnectGmailAction,
  restartGmailSyncAction,
  syncGmailAction,
} from "@/app/(app)/integrations/actions";
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
      lastErrorCode: string | null;
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
    text: "Gmail isn't available on this site yet.",
  },
  demo: {
    tone: "error",
    text: "Gmail needs a real account, not a demo workspace.",
  },
};

const CONNECT_HREF = "/api/integrations/gmail/connect";

// About 10,000 emails per click; past that, the next click carries on.
const MAX_BATCHES = 400;

/** "Checked 120 emails: 3 updates, 1 new application, 2 to review." */
function summarize(checked: number, outcomes: Record<string, number>) {
  const parts = [
    outcomes.applied &&
      `${outcomes.applied} update${outcomes.applied === 1 ? "" : "s"}`,
    outcomes.created &&
      `${outcomes.created} new application${outcomes.created === 1 ? "" : "s"}`,
    outcomes.review && `${outcomes.review} to review`,
  ].filter(Boolean);
  const emails = `${checked} new email${checked === 1 ? "" : "s"}`;
  return parts.length > 0
    ? `Checked ${emails}: ${parts.join(", ")}.`
    : `Checked ${emails}. Nothing needed updating.`;
}

export function GmailCard({
  state,
  result,
}: {
  state: GmailCardState;
  result: string | null;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const message = result ? RESULT_MESSAGES[result] : undefined;
  const syncing = progress !== null;

  /** One batch; a dropped request is retried a few times before giving up. */
  async function syncWithRetries() {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await syncGmailAction();
      } catch {
        await new Promise((done) => setTimeout(done, 2000 * (attempt + 1)));
      }
    }
    return null;
  }

  async function sync() {
    setProgress(0);
    const totals = { applied: 0, created: 0, review: 0, ignored: 0 };
    let checked = 0;
    let more = false;
    try {
      for (let batch = 0; batch < MAX_BATCHES; batch++) {
        const outcome = await syncWithRetries();
        if (!outcome) {
          toast.error(
            "Sync stopped before it finished. Click Sync now to continue.",
          );
          return;
        }
        if (!outcome.ok) {
          toast.error(outcome.error);
          return;
        }
        checked += outcome.processed;
        for (const key of Object.keys(totals) as (keyof typeof totals)[]) {
          totals[key] += outcome.outcomes[key];
        }
        setProgress(checked);
        more = outcome.hasMore;
        if (!more) break;
      }
      const summary = summarize(checked, totals);
      toast.success(
        more ? `${summary} More email to read: Sync now continues.` : summary,
        {
          ...(totals.review > 0
            ? {
                action: {
                  label: "Review",
                  onClick: () => router.push("/activity?tab=review"),
                },
              }
            : {}),
          duration: 8000,
        },
      );
    } finally {
      setProgress(null);
      router.refresh();
    }
  }

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
            applications for you. Access is read-only. For job email, Trackr
            keeps the sender, subject, Gmail&apos;s short preview and what it
            found; it never stores the full message, and keeps nothing but an id
            for other email.
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
          (state.status === "CONNECTED" || state.status === "ERROR" ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={sync} disabled={syncing}>
                <RefreshCw
                  className={syncing ? "animate-spin" : undefined}
                  aria-hidden="true"
                />
                {syncing
                  ? progress > 0
                    ? `Checked ${progress}…`
                    : "Checking…"
                  : state.status === "ERROR"
                    ? "Try again"
                    : "Sync now"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRechecking(true)}
                disabled={syncing}
              >
                Re-check past emails
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirming(true)}
                disabled={syncing}
              >
                <Unplug aria-hidden="true" />
                Disconnect
              </Button>
            </div>
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
      <ConfirmDeleteDialog
        open={rechecking}
        onOpenChange={setRechecking}
        title="Re-check the last 90 days?"
        description="Trackr reads your recent email again with its latest rules. Applications and updates it already made stay as they are; emails waiting for review are looked at afresh."
        confirmLabel="Re-check"
        pendingLabel="Starting…"
        destructive={false}
        onConfirm={async () => {
          const result = await restartGmailSyncAction();
          if (result?.ok) void sync();
          return result;
        }}
      />
    </section>
  );
}

function GmailStatus({ state }: { state: GmailCardState }) {
  if (state.kind === "unavailable") {
    return (
      <p className="text-muted-foreground">
        Gmail isn&apos;t available on this site yet.
      </p>
    );
  }
  if (state.kind === "demo") {
    return (
      <p className="text-muted-foreground">
        Connecting Gmail needs an account. The sample inbox above shows what it
        does.
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
  if (state.status === "ERROR") {
    return (
      <p className="flex items-start gap-2 text-warning">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {state.lastErrorCode === "gmail_api_disabled"
          ? "The Gmail API isn't enabled for this app's Google Cloud project. Enable it, then try again."
          : "The last sync failed. Try again."}
      </p>
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

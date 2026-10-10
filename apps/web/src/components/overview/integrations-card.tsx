import { ChevronRight, Mail, Puzzle } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { googleOAuthConfig } from "@/server/env";
import { listConnectedBrowsers } from "@/server/services/extension-auth";
import { getGmailConnection } from "@/server/services/gmail-connection";
import { SectionCard } from "./section-card";

type State = { label: string; tone: "good" | "warning" | "neutral" };

const DOT: Record<State["tone"], string> = {
  good: "bg-success",
  warning: "bg-warning",
  neutral: "bg-status-neutral",
};

/**
 * Where automatic updates come from, and the state of each source for this
 * user: connected, not connected, needing attention, or sample data in a demo.
 */
export async function IntegrationsCard({
  userId,
  isDemo,
}: {
  userId: string;
  isDemo: boolean;
}) {
  const [gmail, browsers] = await Promise.all([
    getGmailConnection(userId),
    listConnectedBrowsers(userId),
  ]);
  const sample: State = { label: "Sample data", tone: "neutral" };
  const gmailState: State = isDemo
    ? sample
    : !googleOAuthConfig()
      ? { label: "Not available here", tone: "neutral" }
      : gmail?.status === "CONNECTED"
        ? { label: "Connected", tone: "good" }
        : gmail?.status === "NEEDS_REAUTH" || gmail?.status === "ERROR"
          ? { label: "Needs attention", tone: "warning" }
          : { label: "Not connected", tone: "neutral" };
  const extensionState: State = isDemo
    ? sample
    : browsers.length > 0
      ? { label: "Connected", tone: "good" }
      : { label: "Not connected", tone: "neutral" };

  const rows = [
    {
      name: "Gmail",
      description: isDemo
        ? "Try a sample inbox: each email shows what Trackr does with it."
        : "Finds confirmations, interviews and rejections in your inbox.",
      icon: <Mail aria-hidden="true" />,
      state: gmailState,
    },
    {
      name: "Chrome extension",
      description: isDemo
        ? "Simulate a capture to see how applications are added."
        : "Captures applications as you submit them.",
      icon: <Puzzle aria-hidden="true" />,
      state: extensionState,
    },
  ];

  return (
    <SectionCard id="integrations" title="Integrations">
      <ul className="flex flex-col divide-y">
        {rows.map((row) => (
          <li key={row.name} className="py-1 first:pt-0 last:pb-0">
            <Link
              href="/integrations"
              className="group/row -mx-2 flex items-start gap-3 rounded-lg px-2 py-1.5 outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-4">
                {row.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-medium">{row.name}</span>
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "size-1.5 rounded-full",
                        DOT[row.state.tone],
                      )}
                    />
                    {row.state.label}
                  </span>
                </span>
                <span className="block text-[0.8125rem] text-muted-foreground">
                  {row.description}
                </span>
              </span>
              <ChevronRight
                className="mt-2 size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            </Link>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

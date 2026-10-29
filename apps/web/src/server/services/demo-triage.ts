import "server-only";
import {
  computeFit,
  FIT_PROMPT_VERSION,
  fitPostingText,
  type FitResult,
} from "@trackr/domain";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { applications } from "@/server/db/schema";
import type { Database } from "@/server/db/types";
import { DEMO_TABS, type DemoTabPosting } from "@/server/demo/tabs";
import type { StoredFit } from "@/server/fit/types";
import { ingestExtensionSubmission } from "./extension-ingestion";
import { trackedApplication } from "./triage";

/** A sample tab's posting, triaged the way the extension would show it. */
export type DemoTriageItem = {
  key: string;
  companyName: string;
  jobTitle: string;
  status: "SCORED";
  fit: FitResult;
  applicationId: string | null;
  closed: boolean;
};

const posting = (tab: DemoTabPosting) => ({
  companyName: tab.companyName,
  jobTitle: tab.jobTitle,
  location: tab.location,
  description: tab.description,
});

/** The stored form of a sample posting's score, worked out from its ratings. */
function demoFit(tab: DemoTabPosting): StoredFit {
  return {
    ...computeFit(tab.ratings, fitPostingText(posting(tab))),
    model: "claude-haiku-5-5",
    promptVersion: FIT_PROMPT_VERSION,
    costUsd: 0,
  };
}

/**
 * The demo's sample tabs, triaged: each posting's score from its stored
 * ratings (no model call), and whether this workspace already tracks it.
 */
export async function demoTriage(
  userId: string,
  { now = new Date() }: { now?: Date } = {},
  db: Database = getDb(),
): Promise<DemoTriageItem[]> {
  const items: DemoTriageItem[] = [];
  for (const tab of DEMO_TABS) {
    if (!tab.posting) continue;
    const { score, label, criteria, gaps, summary } = demoFit(tab.posting);
    items.push({
      key: tab.id,
      companyName: tab.posting.companyName,
      jobTitle: tab.posting.jobTitle,
      status: "SCORED",
      fit: { score, label, criteria, gaps, summary },
      applicationId: await trackedApplication(
        db,
        userId,
        {
          url: tab.posting.url,
          companyName: tab.posting.companyName,
          jobTitle: tab.posting.jobTitle,
          location: tab.posting.location,
          platform: tab.posting.platform,
          atsJobId: null,
          description: null,
        },
        now,
      ),
      closed: false,
    });
  }
  return items;
}

/**
 * Saves sample postings the way the extension does, through the same
 * pipeline, and gives each its score so it lands in Saved already scored.
 */
export async function saveDemoTriage(
  userId: string,
  ids: string[],
  { now = new Date() }: { now?: Date } = {},
  db: Database = getDb(),
): Promise<number> {
  let saved = 0;
  for (const tab of DEMO_TABS) {
    if (!tab.posting || !ids.includes(tab.id)) continue;
    const { applicationId } = await ingestExtensionSubmission(
      userId,
      {
        clientSubmissionId: crypto.randomUUID(),
        captureMode: "POPUP",
        intent: "SAVED",
        platform: tab.posting.platform,
        companyName: tab.posting.companyName,
        jobTitle: tab.posting.jobTitle,
        jobUrl: tab.posting.url,
        location: tab.posting.location,
        description: tab.posting.description,
        submittedAt: now.toISOString(),
      },
      db,
    );
    const fit = demoFit(tab.posting);
    await db
      .update(applications)
      .set({ fitScore: fit.score, fit, fitScoredAt: now })
      .where(
        and(
          eq(applications.id, applicationId),
          eq(applications.userId, userId),
        ),
      );
    saved++;
  }
  return saved;
}

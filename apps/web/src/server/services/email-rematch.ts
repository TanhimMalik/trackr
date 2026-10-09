import "server-only";
import type { SourcePlatform } from "@trackr/domain";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { emails, reviewItems } from "@/server/db/schema";
import type { Database } from "@/server/db/types";
import { PLACEHOLDER_TITLE } from "./email-processing";
import { routeEmail } from "./email-routing";
import { applyEmailReview, createApplicationFromEmail } from "./review";

export type RematchResult = {
  applied: number;
  created: number;
  suggested: number;
};

/**
 * Looks again at emails waiting for review, oldest first, now that more
 * applications may exist: a confirmation processed later may have created
 * the application an earlier-read rejection belongs to. The same routing
 * rules as sync decide: apply, start an application, or keep asking (with
 * a better suggestion when there is one).
 */
export async function rematchEmailReviews(
  userId: string,
  db: Database = getDb(),
): Promise<RematchResult> {
  const open = await db
    .select({ item: reviewItems, email: emails })
    .from(reviewItems)
    .innerJoin(emails, eq(emails.id, reviewItems.emailId))
    .where(
      and(
        eq(reviewItems.userId, userId),
        eq(reviewItems.state, "OPEN"),
        inArray(reviewItems.kind, ["EMAIL_UNMATCHED", "EMAIL_POSSIBLE_MATCH"]),
      ),
    )
    .orderBy(asc(emails.receivedAt));

  const result: RematchResult = { applied: 0, created: 0, suggested: 0 };
  for (const { item, email } of open) {
    if (!email.classification || email.classificationConfidence === null) {
      continue;
    }
    const extracted = (email.extractedJson ?? {}) as {
      companyDomain?: string | null;
      platform?: SourcePlatform | null;
      atsJobId?: string | null;
    };
    const route = await routeEmail(db, userId, {
      classification: email.classification,
      confidence: email.classificationConfidence,
      method: email.classificationMethod ?? "RULES",
      companyName: email.companyName,
      companyDomain: extracted.companyDomain ?? null,
      jobTitle: email.jobTitle,
      platform: extracted.platform ?? null,
      atsJobId: extracted.atsJobId ?? null,
      fromEmail: email.senderEmail ?? "",
      threadId: email.gmailThreadId,
      receivedAt: email.receivedAt,
    });

    if (route.action === "apply") {
      await db
        .update(reviewItems)
        .set({ candidateApplicationId: route.applicationId })
        .where(eq(reviewItems.id, item.id));
      await applyEmailReview(userId, item.id, db);
      result.applied++;
    } else if (route.action === "create") {
      await createApplicationFromEmail(
        userId,
        item.id,
        {
          companyName: email.companyName,
          jobTitle: email.jobTitle ?? PLACEHOLDER_TITLE,
        },
        db,
      );
      result.created++;
    } else if (
      route.action === "review" &&
      route.candidateId &&
      route.candidateId !== item.candidateApplicationId
    ) {
      await db
        .update(reviewItems)
        .set({
          kind: route.kind,
          applicationId: route.candidateId,
          candidateApplicationId: route.candidateId,
          matchScore: route.match?.best?.score ?? null,
        })
        .where(eq(reviewItems.id, item.id));
      result.suggested++;
    }
  }
  return result;
}

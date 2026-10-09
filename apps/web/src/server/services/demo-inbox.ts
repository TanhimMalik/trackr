import "server-only";
import { getDb } from "@/server/db/client";
import type { Database } from "@/server/db/types";
import type { DemoEmail } from "@/server/demo/emails";
import { processIncomingEmail, type EmailOutcome } from "./email-processing";

/**
 * Delivers a demo email to the pipeline Gmail sync uses, as though it had
 * just arrived. Each delivery is a new message, so a sample can be resent.
 */
export async function deliverDemoEmail(
  userId: string,
  email: DemoEmail,
  { now = new Date() }: { now?: Date } = {},
  db: Database = getDb(),
): Promise<EmailOutcome> {
  const messageId = `demo-${crypto.randomUUID()}`;
  return processIncomingEmail(
    db,
    { userId, integrationId: null },
    {
      ref: { id: messageId, threadId: messageId },
      receivedAt: now,
      metadata: {
        fromName: email.fromName,
        fromEmail: email.fromEmail,
        subject: email.subject,
        snippet: email.body.replace(/\s+/g, " ").slice(0, 160),
        labels: email.labels ?? ["INBOX", "UNREAD"],
        hasListUnsubscribe: email.hasListUnsubscribe ?? false,
      },
      loadContent: async (metadata) => ({
        ...metadata,
        body: email.body,
        links: email.links ?? [],
        calendarStart: null,
      }),
    },
  );
}

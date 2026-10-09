import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import {
  applicationEvents,
  applications,
  contacts,
  emails,
  extensionSessions,
  integrations,
  interviews,
  notifications,
  resumeVersions,
  reviewItems,
  userSettings,
  users,
} from "@/server/db/schema";
import type { Database } from "@/server/db/types";
import { hasAuthUsersTable } from "./demo-workspace";
import { disconnectGmail } from "./gmail-connection";

/**
 * Everything Trackr keeps about a user, as JSON. Secrets are left out:
 * OAuth tokens, extension token hashes and sync cursors stay behind.
 */
export async function exportUserData(
  userId: string,
  { now = new Date() }: { now?: Date } = {},
  db: Database = getDb(),
) {
  const own = <T extends { userId: unknown }>(table: T) =>
    eq(table.userId as never, userId);
  const [
    [user],
    settings,
    applicationRows,
    events,
    contactRows,
    interviewRows,
    notificationRows,
    reviewRows,
    emailRows,
    integrationRows,
    sessionRows,
    resumeRows,
  ] = await Promise.all([
    db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, userId)),
    db
      .select({
        followUpRemindersEnabled: userSettings.followUpRemindersEnabled,
        followUpAfterDays: userSettings.followUpAfterDays,
        autoTrackSupportedSites: userSettings.autoTrackSupportedSites,
        emailAutoUpdate: userSettings.emailAutoUpdate,
        emailAskMediumConfidence: userSettings.emailAskMediumConfidence,
      })
      .from(userSettings)
      .where(own(userSettings)),
    db.select().from(applications).where(own(applications)),
    db.select().from(applicationEvents).where(own(applicationEvents)),
    db.select().from(contacts).where(own(contacts)),
    db.select().from(interviews).where(own(interviews)),
    db.select().from(notifications).where(own(notifications)),
    db.select().from(reviewItems).where(own(reviewItems)),
    // Job-related emails only; ignored ones are identifiers and nothing else.
    db
      .select()
      .from(emails)
      .where(and(own(emails), sql`${emails.processingStatus} <> 'IGNORED'`)),
    db
      .select({
        provider: integrations.provider,
        status: integrations.status,
        accountEmail: integrations.providerAccountEmail,
        scopes: integrations.scopes,
        lastSyncedAt: integrations.lastSyncedAt,
        createdAt: integrations.createdAt,
      })
      .from(integrations)
      .where(own(integrations)),
    db
      .select({
        label: extensionSessions.label,
        createdAt: extensionSessions.createdAt,
        lastUsedAt: extensionSessions.lastUsedAt,
        revokedAt: extensionSessions.revokedAt,
      })
      .from(extensionSessions)
      .where(own(extensionSessions)),
    db.select().from(resumeVersions).where(own(resumeVersions)),
  ]);
  return {
    exportedAt: now.toISOString(),
    format: "trackr-export-v1",
    user,
    settings: settings[0] ?? null,
    applications: applicationRows,
    applicationEvents: events,
    contacts: contactRows,
    interviews: interviewRows,
    notifications: notificationRows,
    reviewItems: reviewRows,
    emails: emailRows,
    integrations: integrationRows,
    browserExtensions: sessionRows,
    resumeVersions: resumeRows,
  };
}

/**
 * Deletes what Trackr kept from Gmail: every stored email, the review items
 * and notifications that came from them. Applications and their history
 * stay; timeline entries simply lose their email preview. Gmail stays
 * connected and only reads new mail from here on.
 */
export async function deleteEmailData(
  userId: string,
  db: Database = getDb(),
): Promise<{ emails: number }> {
  return db.transaction(async (tx) => {
    // Review items cascade with their emails.
    const deleted = await tx
      .delete(emails)
      .where(eq(emails.userId, userId))
      .returning({ id: emails.id });
    await tx.execute(sql`
      delete from ${notifications} n
      where n.user_id = ${userId}
        and n.type = 'REVIEW_NEEDED'
        and not exists (
          select 1 from ${reviewItems} r
          where r.user_id = n.user_id and 'review:' || r.id::text = n.dedupe_key
        )
    `);
    return { emails: deleted.length };
  });
}

/**
 * Deletes an account for good: Gmail access is revoked at Google, then the
 * user and everything they own (it cascades) and their sign-in are deleted.
 */
export async function deleteAccount(
  userId: string,
  {
    revokeGmail = disconnectGmail,
  }: { revokeGmail?: typeof disconnectGmail } = {},
  db: Database = getDb(),
): Promise<void> {
  // Best effort: an expired or already-revoked token mustn't block deletion.
  await revokeGmail(userId, {}, db).catch(() => {});
  await db.transaction(async (tx) => {
    await tx.delete(users).where(eq(users.id, userId));
    if (await hasAuthUsersTable(tx)) {
      await tx.execute(sql`delete from auth.users where id = ${userId}`);
    }
  });
}

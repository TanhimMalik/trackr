import "server-only";
import {
  DEFAULT_FOLLOW_UP_AFTER_DAYS,
  deriveApplicationState,
  notificationForEvent,
  type InterviewType,
  type StatusEvent,
} from "@trackr/domain";
import { and, count, eq, lt, sql } from "drizzle-orm";
import { createApplicationSchema } from "@/lib/applications/input";
import { getDb } from "@/server/db/client";
import {
  applicationEvents,
  applications,
  contacts,
  emails,
  interviews,
  notifications,
  users,
} from "@/server/db/schema";
import type { Database } from "@/server/db/types";
import {
  DEMO_APPLICATIONS,
  type DemoApplication,
  type DemoEvent,
  type DemoInterview,
} from "@/server/demo/applications";
import { seedEmailFor } from "@/server/demo/emails";
import { deleteAllApplications, newApplicationValues } from "./applications";
import { validateEventInput } from "./events";
import { eventDedupeKey } from "./notifications";
import { generateFollowUpReminders } from "./reminders";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** How long a demo workspace lasts before it is deleted. */
export const DEMO_LIFETIME_HOURS = 48;
/** The most applications a demo workspace may hold. */
export const DEMO_APPLICATION_LIMIT = 100;

// Gmail-detected events are recorded a few minutes after the email arrived.
const EMAIL_DETECTION_DELAY_MS = 3 * 60 * 1000;
// The notification center shows the last month; the latest few are unread.
const NOTIFICATION_WINDOW_DAYS = 30;
const UNREAD_WITHIN_DAYS = 10;

export class WorkspaceNotEmptyError extends Error {
  constructor() {
    super("Demo data can only be added to a workspace with no applications");
    this.name = "WorkspaceNotEmptyError";
  }
}

function occurredAt(event: DemoEvent, now: Date): Date {
  const date = new Date(now.getTime() - event.day * DAY_MS);
  date.setUTCHours(event.hour ?? 14, event.minute ?? 0, 0, 0);
  return date;
}

const SOURCE_TYPES = {
  extension: "BROWSER_EXTENSION",
  email: "EMAIL",
  manual: "MANUAL",
} as const;

/**
 * Builds the rows for one demo application. Status, dates and transitions come
 * from the same domain rules the event processor uses.
 */
function interviewTime(interview: DemoInterview, now: Date): Date {
  const date = new Date(now.getTime() + interview.inDays * DAY_MS);
  date.setUTCHours(interview.hour, 0, 0, 0);
  return date;
}

function planApplication(userId: string, demo: DemoApplication, now: Date) {
  const { events: demoEvents, contacts: demoContacts = [], ...fields } = demo;
  const data = createApplicationSchema.parse(fields);
  const applicationId = crypto.randomUUID();

  const contacts = demoContacts.map((contact) => ({
    ...contact,
    id: crypto.randomUUID(),
    applicationId,
    userId,
  }));
  const contactIds = new Map(contacts.map((c) => [c.name, c.id]));

  const events = demoEvents.map((demoEvent) => {
    const when = occurredAt(demoEvent, now);
    const isEmail = demoEvent.via === "email";
    const scheduledAt = demoEvent.interview
      ? interviewTime(demoEvent.interview, now)
      : null;
    const input = validateEventInput({
      userId,
      applicationId,
      type: demoEvent.type,
      occurredAt: when,
      sourceType: SOURCE_TYPES[demoEvent.via],
      // Message ids are per user, so each seeded email gets its own.
      sourceReference: isEmail ? `demo-${crypto.randomUUID()}` : null,
      classificationMethod: isEmail ? (demoEvent.method ?? "RULES") : null,
      confidence: isEmail ? (demoEvent.confidence ?? 0.97) : null,
      metadata: scheduledAt
        ? { ...demoEvent.metadata, scheduledAt: scheduledAt.toISOString() }
        : demoEvent.metadata,
      dedupeKey: `demo:${crypto.randomUUID()}`,
    });
    return {
      id: crypto.randomUUID(),
      input,
      recordedAt: new Date(
        when.getTime() + (isEmail ? EMAIL_DETECTION_DELAY_MS : 0),
      ),
      interview: demoEvent.interview,
      scheduledAt,
    };
  });

  // Each scheduled interview, as the event processor would create it, with
  // the details a person would have filled in since.
  const interviewRows = events.flatMap((event) => {
    if (!event.interview || !event.scheduledAt) return [];
    const metadata = event.input.metadata as { interviewKind?: InterviewType };
    return [
      {
        applicationId,
        userId,
        interviewType: metadata.interviewKind ?? ("OTHER" as const),
        scheduledAt: event.scheduledAt,
        durationMinutes: event.interview.durationMinutes ?? null,
        meetingUrl: event.interview.meetingUrl ?? null,
        location: event.interview.location ?? null,
        contactId: event.interview.with
          ? (contactIds.get(event.interview.with) ?? null)
          : null,
        status:
          event.interview.inDays < 0
            ? ("COMPLETED" as const)
            : ("SCHEDULED" as const),
        sourceEventId: event.id,
      },
    ];
  });

  const state = deriveApplicationState(
    events.map(({ id, input, recordedAt }): StatusEvent => ({
      id,
      type: input.type,
      occurredAt: input.occurredAt,
      recordedAt,
      sourceType: input.sourceType,
      metadata: input.metadata,
    })),
  );
  const transitions = new Map(state.transitions.map((t) => [t.eventId, t]));

  // What the notification center would have collected along the way.
  const notificationRows = events.flatMap(({ id, input, recordedAt }) => {
    const age = now.getTime() - recordedAt.getTime();
    if (age > NOTIFICATION_WINDOW_DAYS * DAY_MS) return [];
    const notification = notificationForEvent(
      {
        type: input.type,
        sourceType: input.sourceType,
        statusBefore: transitions.get(id)?.before ?? null,
        statusAfter: transitions.get(id)?.after ?? null,
      },
      data.companyName,
    );
    if (!notification) return [];
    return [
      {
        ...notification,
        userId,
        applicationId,
        eventId: id,
        body: data.jobTitle,
        dedupeKey: eventDedupeKey(id),
        createdAt: recordedAt,
        readAt:
          age > UNREAD_WITHIN_DAYS * DAY_MS
            ? new Date(recordedAt.getTime() + 2 * HOUR_MS)
            : null,
      },
    ];
  });

  // The emails behind Gmail-detected events, as sync would have kept them.
  const emailRows = events.flatMap(({ input, recordedAt }) => {
    if (input.sourceType !== "EMAIL" || !input.sourceReference) return [];
    const { evidence, ...email } = seedEmailFor(input.type, {
      companyName: data.companyName,
      jobTitle: data.jobTitle,
      platform: data.sourcePlatform ?? null,
    });
    return [
      {
        ...email,
        userId,
        applicationId,
        gmailMessageId: input.sourceReference,
        gmailThreadId: input.sourceReference,
        senderDomain: email.senderEmail?.split("@")[1] ?? null,
        receivedAt: input.occurredAt,
        classificationConfidence: input.confidence ?? null,
        classificationMethod: input.classificationMethod ?? null,
        extractedJson: { evidence },
        companyName: data.companyName,
        jobTitle: data.jobTitle,
        processingStatus: "MATCHED" as const,
        createdAt: recordedAt,
      },
    ];
  });

  return {
    contacts,
    emails: emailRows,
    interviews: interviewRows,
    notifications: notificationRows,
    application: {
      ...newApplicationValues(userId, data),
      id: applicationId,
      currentStatus: state.status,
      appliedAt: state.appliedAt,
      lastActivityAt: state.lastActivityAt ?? now,
      createdAt: events[0]?.recordedAt ?? now,
    },
    events: events.map(({ id, input, recordedAt }) => ({
      id,
      applicationId,
      userId,
      eventType: input.type,
      eventTimestamp: input.occurredAt,
      sourceType: input.sourceType,
      sourceReference: input.sourceReference ?? null,
      classificationMethod: input.classificationMethod ?? null,
      confidence: input.confidence ?? null,
      metadata: input.metadata,
      dedupeKey: input.dedupeKey,
      statusBefore: transitions.get(id)?.before ?? null,
      statusAfter: transitions.get(id)?.after ?? null,
      createdAt: recordedAt,
    })),
  };
}

/**
 * Fills an empty workspace with a realistic job search dated relative to
 * `now`, so it always looks current. Used for demo sessions and development.
 * Writes everything in two statements, so it is fast enough to run on demand.
 */
export async function seedDemoWorkspace(
  userId: string,
  { now = new Date() }: { now?: Date } = {},
  db: Database = getDb(),
): Promise<{
  applications: number;
  events: number;
  contacts: number;
  interviews: number;
  notifications: number;
}> {
  const plans = DEMO_APPLICATIONS.map((demo) =>
    planApplication(userId, demo, now),
  );

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.userId, userId))
      .limit(1);
    if (existing) throw new WorkspaceNotEmptyError();

    await tx.insert(applications).values(plans.map((plan) => plan.application));
    const events = plans.flatMap((plan) => plan.events);
    await tx.insert(applicationEvents).values(events);
    const demoEmails = plans.flatMap((plan) => plan.emails);
    if (demoEmails.length > 0) await tx.insert(emails).values(demoEmails);
    const demoContacts = plans.flatMap((plan) => plan.contacts);
    if (demoContacts.length > 0) await tx.insert(contacts).values(demoContacts);
    const demoInterviews = plans.flatMap((plan) => plan.interviews);
    if (demoInterviews.length > 0) {
      await tx.insert(interviews).values(demoInterviews);
    }
    const demoNotifications = plans.flatMap((plan) => plan.notifications);
    if (demoNotifications.length > 0) {
      await tx.insert(notifications).values(demoNotifications);
    }
    const reminders = await generateFollowUpReminders(
      userId,
      {
        now,
        afterDays: DEFAULT_FOLLOW_UP_AFTER_DAYS,
        readBefore: new Date(now.getTime() - UNREAD_WITHIN_DAYS * DAY_MS),
      },
      tx,
    );

    return {
      applications: plans.length,
      events: events.length,
      contacts: demoContacts.length,
      interviews: demoInterviews.length,
      notifications: demoNotifications.length + reminders,
    };
  });
}

/** Puts a demo workspace back to its starting sample data. */
export async function resetDemoWorkspace(
  userId: string,
  { now = new Date() }: { now?: Date } = {},
  db: Database = getDb(),
): Promise<void> {
  await deleteAllApplications(userId, db);
  // Emails delivered from the sample inbox, and their review items.
  await db.delete(emails).where(eq(emails.userId, userId));
  await seedDemoWorkspace(userId, { now }, db);
}

// The Supabase auth schema exists in production but not in tests.
export async function hasAuthUsersTable(db: Database): Promise<boolean> {
  const [row] = await db
    .select({ tables: count() })
    .from(sql`information_schema.tables`)
    .where(sql`table_schema = 'auth' and table_name = 'users'`);
  return (row?.tables ?? 0) > 0;
}

/**
 * Deletes a demo account: its workspace, and its anonymous sign-in so the
 * session cannot be resumed. Real accounts are never touched. Returns whether
 * there was a demo workspace to delete.
 */
export async function deleteDemoWorkspace(
  userId: string,
  db: Database = getDb(),
): Promise<boolean> {
  const deleted = await db
    .delete(users)
    .where(and(eq(users.id, userId), eq(users.isDemo, true)))
    .returning({ id: users.id });
  if (await hasAuthUsersTable(db)) {
    await db.execute(
      sql`delete from auth.users where id = ${userId} and is_anonymous`,
    );
  }
  return deleted.length > 0;
}

/**
 * Deletes demo workspaces, and anonymous sign-ins, older than the demo
 * lifetime. Runs whenever a new demo starts, so expired demos never pile up.
 */
export async function deleteExpiredDemoWorkspaces(
  { now = new Date() }: { now?: Date } = {},
  db: Database = getDb(),
): Promise<{ workspaces: number }> {
  const cutoff = new Date(now.getTime() - DEMO_LIFETIME_HOURS * HOUR_MS);
  const deleted = await db
    .delete(users)
    .where(and(eq(users.isDemo, true), lt(users.createdAt, cutoff)))
    .returning({ id: users.id });
  if (await hasAuthUsersTable(db)) {
    // An ISO string: the postgres-js driver doesn't serialize raw dates in
    // hand-written SQL.
    await db.execute(
      sql`delete from auth.users where is_anonymous and created_at < ${cutoff.toISOString()}::timestamptz`,
    );
  }
  return { workspaces: deleted.length };
}

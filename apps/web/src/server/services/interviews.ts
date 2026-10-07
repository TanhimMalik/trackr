import "server-only";
import { parseEventMetadata, type InterviewStatus } from "@trackr/domain";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { interviewInputSchema } from "@/lib/applications/details-input";
import { getDb } from "@/server/db/client";
import { applications, contacts, interviews } from "@/server/db/schema";
import type { ApplicationEvent, Database, Interview } from "@/server/db/types";
import { NotFoundError } from "./errors";
import { assertId } from "./ids";

async function assertApplicationOwned(
  db: Database,
  userId: string,
  applicationId: string,
) {
  assertId(applicationId, "Application");
  const [row] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(
      and(eq(applications.id, applicationId), eq(applications.userId, userId)),
    );
  if (!row) throw new NotFoundError("Application");
}

/** A contact can only be attached to an interview for the same application. */
async function assertContactBelongs(
  db: Database,
  userId: string,
  applicationId: string,
  contactId: string | null | undefined,
) {
  if (!contactId) return;
  const [row] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      and(
        eq(contacts.id, contactId),
        eq(contacts.userId, userId),
        eq(contacts.applicationId, applicationId),
      ),
    );
  if (!row) throw new NotFoundError("Contact");
}

/** Interviews for an application: dated ones in order, undated ones last. */
export async function listInterviews(
  userId: string,
  applicationId: string,
  db: Database = getDb(),
): Promise<Interview[]> {
  return db
    .select()
    .from(interviews)
    .where(
      and(
        eq(interviews.applicationId, applicationId),
        eq(interviews.userId, userId),
      ),
    )
    .orderBy(
      sql`${interviews.scheduledAt} asc nulls last`,
      asc(interviews.createdAt),
    );
}

export async function createInterview(
  userId: string,
  applicationId: string,
  /** Validated here with `interviewInputSchema`. */
  input: unknown,
  db: Database = getDb(),
): Promise<Interview> {
  const data = interviewInputSchema.parse(input);
  await assertApplicationOwned(db, userId, applicationId);
  await assertContactBelongs(db, userId, applicationId, data.contactId);
  const [row] = await db
    .insert(interviews)
    .values({ ...data, userId, applicationId })
    .returning();
  return row!;
}

async function ownedInterview(
  db: Database,
  userId: string,
  interviewId: string,
): Promise<Interview> {
  assertId(interviewId, "Interview");
  const [row] = await db
    .select()
    .from(interviews)
    .where(and(eq(interviews.id, interviewId), eq(interviews.userId, userId)));
  if (!row) throw new NotFoundError("Interview");
  return row;
}

export async function updateInterview(
  userId: string,
  interviewId: string,
  /** Validated here with `interviewInputSchema`. */
  input: unknown,
  db: Database = getDb(),
): Promise<Interview> {
  const data = interviewInputSchema.parse(input);
  const existing = await ownedInterview(db, userId, interviewId);
  await assertContactBelongs(
    db,
    userId,
    existing.applicationId,
    data.contactId,
  );
  // An edit replaces every field; anything left blank is cleared.
  const [row] = await db
    .update(interviews)
    .set({
      interviewType: data.interviewType,
      scheduledAt: data.scheduledAt ?? null,
      durationMinutes: data.durationMinutes ?? null,
      meetingUrl: data.meetingUrl ?? null,
      location: data.location ?? null,
      contactId: data.contactId ?? null,
      status: data.status,
    })
    .where(eq(interviews.id, interviewId))
    .returning();
  return row!;
}

export async function setInterviewStatus(
  userId: string,
  interviewId: string,
  status: InterviewStatus,
  db: Database = getDb(),
): Promise<Interview> {
  await ownedInterview(db, userId, interviewId);
  const [row] = await db
    .update(interviews)
    .set({ status })
    .where(eq(interviews.id, interviewId))
    .returning();
  return row!;
}

export async function deleteInterview(
  userId: string,
  interviewId: string,
  db: Database = getDb(),
): Promise<void> {
  await ownedInterview(db, userId, interviewId);
  await db.delete(interviews).where(eq(interviews.id, interviewId));
}

/**
 * Keeps interviews in step with events, inside the event processor's
 * transaction. "Interview scheduled" with a time creates an interview linked
 * to the event; "rescheduled" moves the latest scheduled one (or creates one).
 */
export async function syncInterviewForEvent(
  tx: Database,
  event: ApplicationEvent,
): Promise<void> {
  if (
    event.eventType !== "INTERVIEW_SCHEDULED" &&
    event.eventType !== "INTERVIEW_RESCHEDULED"
  ) {
    return;
  }
  const metadata = parseEventMetadata(event.eventType, event.metadata);
  if (!metadata.scheduledAt) return;
  const scheduledAt = new Date(metadata.scheduledAt);

  const [linked] = await tx
    .select({ id: interviews.id })
    .from(interviews)
    .where(eq(interviews.sourceEventId, event.id));
  if (linked) return;

  if (event.eventType === "INTERVIEW_RESCHEDULED") {
    const [latest] = await tx
      .select({ id: interviews.id })
      .from(interviews)
      .where(
        and(
          eq(interviews.applicationId, event.applicationId),
          eq(interviews.userId, event.userId),
          eq(interviews.status, "SCHEDULED"),
        ),
      )
      .orderBy(desc(interviews.scheduledAt))
      .limit(1);
    if (latest) {
      await tx
        .update(interviews)
        .set({ scheduledAt })
        .where(eq(interviews.id, latest.id));
      return;
    }
  }

  await tx.insert(interviews).values({
    applicationId: event.applicationId,
    userId: event.userId,
    interviewType: metadata.interviewKind ?? "OTHER",
    scheduledAt,
    sourceEventId: event.id,
  });
}

/** Removes the interview an event created, when that event is undone. */
export async function removeInterviewsForEvent(
  tx: Database,
  eventId: string,
): Promise<void> {
  await tx.delete(interviews).where(eq(interviews.sourceEventId, eventId));
}

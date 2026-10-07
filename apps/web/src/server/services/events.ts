import "server-only";
import {
  applicationEventTypeSchema,
  applicationStatusSchema,
  classificationMethodSchema,
  deriveApplicationState,
  eventSourceTypeSchema,
  parseEventMetadata,
  type ApplicationStatus,
  type StatusEvent,
} from "@trackr/domain";
import { and, asc, count, eq, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { applicationEvents, applications } from "@/server/db/schema";
import type { ApplicationEvent, Database } from "@/server/db/types";
import { LastEventError, NotFoundError } from "./errors";

const eventInputSchema = z.object({
  userId: z.uuid(),
  applicationId: z.uuid(),
  type: applicationEventTypeSchema,
  occurredAt: z.date().refine((date) => !Number.isNaN(date.getTime())),
  sourceType: eventSourceTypeSchema,
  sourceReference: z.string().max(500).nullish(),
  classificationMethod: classificationMethodSchema.nullish(),
  confidence: z.number().min(0).max(1).nullish(),
  metadata: z.unknown().optional(),
  /** Identifies the real-world occurrence, e.g. "email:<messageId>", so it is only recorded once. */
  dedupeKey: z.string().min(1).max(500),
});

export type ApplicationEventInput = z.input<typeof eventInputSchema>;

export type ProcessedEvent = {
  event: ApplicationEvent;
  /** True when an event with the same dedupe key already existed; nothing changed. */
  deduplicated: boolean;
  previousStatus: ApplicationStatus;
  status: ApplicationStatus;
};

/**
 * The single entry point for anything that can change an application's
 * status. In one transaction it locks the application, records the event
 * (ignoring repeats of the same dedupe key) and re-derives the status.
 */
export async function processApplicationEvent(
  input: ApplicationEventInput,
  db: Database = getDb(),
): Promise<ProcessedEvent> {
  const event = validateEventInput(input);

  return db.transaction(async (tx) => {
    const [application] = await tx
      .select({ currentStatus: applications.currentStatus })
      .from(applications)
      .where(
        and(
          eq(applications.id, event.applicationId),
          eq(applications.userId, event.userId),
        ),
      )
      .for("update");
    if (!application) throw new NotFoundError("Application");

    const { row, deduplicated } = await insertEvent(tx, event);
    if (deduplicated) {
      return {
        event: row,
        deduplicated,
        previousStatus: application.currentStatus,
        status: application.currentStatus,
      };
    }

    const status = await recomputeApplicationState(
      tx,
      event.userId,
      event.applicationId,
    );
    const [stored] = await tx
      .select()
      .from(applicationEvents)
      .where(eq(applicationEvents.id, row.id));

    return {
      event: stored!,
      deduplicated,
      previousStatus: application.currentStatus,
      status,
    };
  });
}

type ValidatedEvent = z.output<typeof eventInputSchema> & {
  metadata: Record<string, unknown>;
};

/**
 * Inserts an event unless one with the same dedupe key exists for the user.
 * Must run inside a transaction that also recomputes the application's state.
 */
export async function insertEvent(
  tx: Database,
  event: ValidatedEvent,
): Promise<{ row: ApplicationEvent; deduplicated: boolean }> {
  const [inserted] = await tx
    .insert(applicationEvents)
    .values({
      applicationId: event.applicationId,
      userId: event.userId,
      eventType: event.type,
      eventTimestamp: event.occurredAt,
      sourceType: event.sourceType,
      sourceReference: event.sourceReference ?? null,
      classificationMethod: event.classificationMethod ?? null,
      confidence: event.confidence ?? null,
      metadata: event.metadata,
      dedupeKey: event.dedupeKey,
    })
    .onConflictDoNothing({
      target: [applicationEvents.userId, applicationEvents.dedupeKey],
    })
    .returning();

  if (inserted) return { row: inserted, deduplicated: false };

  const [existing] = await tx
    .select()
    .from(applicationEvents)
    .where(
      and(
        eq(applicationEvents.userId, event.userId),
        eq(applicationEvents.dedupeKey, event.dedupeKey),
      ),
    );
  return { row: existing!, deduplicated: true };
}

/** Validates an event's input and metadata without writing anything. */
export function validateEventInput(
  input: ApplicationEventInput,
): ValidatedEvent {
  const parsed = eventInputSchema.parse(input);
  return {
    ...parsed,
    metadata: parseEventMetadata(parsed.type, parsed.metadata),
  };
}

function statusMetadata(metadata: Record<string, unknown>) {
  const toStatus = applicationStatusSchema.safeParse(metadata.toStatus);
  return {
    isFinalRound: metadata.isFinalRound === true,
    toStatus: toStatus.success ? toStatus.data : undefined,
  };
}

/**
 * Replays the application's events and stores the derived status, dates and
 * per-event transitions. Returns the resulting status.
 */
export async function recomputeApplicationState(
  tx: Database,
  userId: string,
  applicationId: string,
): Promise<ApplicationStatus> {
  const rows = await tx
    .select()
    .from(applicationEvents)
    .where(
      and(
        eq(applicationEvents.applicationId, applicationId),
        eq(applicationEvents.userId, userId),
      ),
    )
    .orderBy(asc(applicationEvents.eventTimestamp));

  const state = deriveApplicationState(
    rows.map((row): StatusEvent => ({
      id: row.id,
      type: row.eventType,
      occurredAt: row.eventTimestamp,
      recordedAt: row.createdAt,
      sourceType: row.sourceType,
      metadata: statusMetadata(row.metadata),
      revertedAt: row.revertedAt,
    })),
  );

  await tx
    .update(applications)
    .set({
      currentStatus: state.status,
      appliedAt: state.appliedAt,
      ...(state.lastActivityAt ? { lastActivityAt: state.lastActivityAt } : {}),
    })
    .where(
      and(eq(applications.id, applicationId), eq(applications.userId, userId)),
    );

  // Store each event's before/after status; reverted events have none.
  const transitions = new Map(state.transitions.map((t) => [t.eventId, t]));
  for (const row of rows) {
    const transition = transitions.get(row.id);
    const before = transition?.before ?? null;
    const after = transition?.after ?? null;
    if (row.statusBefore !== before || row.statusAfter !== after) {
      await tx
        .update(applicationEvents)
        .set({ statusBefore: before, statusAfter: after })
        .where(eq(applicationEvents.id, row.id));
    }
  }

  return state.status;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type EventChange = {
  event: ApplicationEvent;
  companyName: string;
  previousStatus: ApplicationStatus;
  status: ApplicationStatus;
};

/**
 * Marks an event as undone or brings it back, then re-derives the
 * application's status from the events that remain. Repeating either is
 * harmless. An application always keeps at least one active event.
 */
async function setEventReverted(
  userId: string,
  eventId: string,
  reverted: boolean,
  db: Database,
): Promise<EventChange> {
  if (!UUID.test(eventId)) throw new NotFoundError("Event");

  return db.transaction(async (tx) => {
    const [target] = await tx
      .select({
        applicationId: applicationEvents.applicationId,
        revertedAt: applicationEvents.revertedAt,
      })
      .from(applicationEvents)
      .where(
        and(
          eq(applicationEvents.id, eventId),
          eq(applicationEvents.userId, userId),
        ),
      );
    if (!target) throw new NotFoundError("Event");

    // Serialize with any other change to the same application.
    const [application] = await tx
      .select({
        companyName: applications.companyName,
        currentStatus: applications.currentStatus,
      })
      .from(applications)
      .where(
        and(
          eq(applications.id, target.applicationId),
          eq(applications.userId, userId),
        ),
      )
      .for("update");
    if (!application) throw new NotFoundError("Event");

    const alreadyDone = reverted
      ? target.revertedAt !== null
      : target.revertedAt === null;
    if (!alreadyDone) {
      if (reverted) {
        const [others] = await tx
          .select({ active: count() })
          .from(applicationEvents)
          .where(
            and(
              eq(applicationEvents.applicationId, target.applicationId),
              isNull(applicationEvents.revertedAt),
              ne(applicationEvents.id, eventId),
            ),
          );
        if ((others?.active ?? 0) === 0) throw new LastEventError();
      }
      await tx
        .update(applicationEvents)
        .set({ revertedAt: reverted ? new Date() : null })
        .where(eq(applicationEvents.id, eventId));
    }

    const status = await recomputeApplicationState(
      tx,
      userId,
      target.applicationId,
    );
    const [event] = await tx
      .select()
      .from(applicationEvents)
      .where(eq(applicationEvents.id, eventId));

    return {
      event: event!,
      companyName: application.companyName,
      previousStatus: application.currentStatus,
      status,
    };
  });
}

/** Undoes an event: it stays in the timeline, struck through, and stops counting. */
export function revertEvent(
  userId: string,
  eventId: string,
  db: Database = getDb(),
): Promise<EventChange> {
  return setEventReverted(userId, eventId, true, db);
}

/** Brings back an event that was undone. */
export function restoreEvent(
  userId: string,
  eventId: string,
  db: Database = getDb(),
): Promise<EventChange> {
  return setEventReverted(userId, eventId, false, db);
}

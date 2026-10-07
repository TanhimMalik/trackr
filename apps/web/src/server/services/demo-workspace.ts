import "server-only";
import { deriveApplicationState, type StatusEvent } from "@trackr/domain";
import { eq } from "drizzle-orm";
import { createApplicationSchema } from "@/lib/applications/input";
import { getDb } from "@/server/db/client";
import { applicationEvents, applications } from "@/server/db/schema";
import type { Database } from "@/server/db/types";
import {
  DEMO_APPLICATIONS,
  type DemoApplication,
  type DemoEvent,
} from "@/server/demo/applications";
import { newApplicationValues } from "./applications";
import { validateEventInput } from "./events";

const DAY_MS = 24 * 60 * 60 * 1000;

// Gmail-detected events are recorded a few minutes after the email arrived.
const EMAIL_DETECTION_DELAY_MS = 3 * 60 * 1000;

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
function planApplication(userId: string, demo: DemoApplication, now: Date) {
  const { events: demoEvents, ...fields } = demo;
  const data = createApplicationSchema.parse(fields);
  const applicationId = crypto.randomUUID();

  const events = demoEvents.map((demoEvent, index) => {
    const when = occurredAt(demoEvent, now);
    const isEmail = demoEvent.via === "email";
    const input = validateEventInput({
      userId,
      applicationId,
      type: demoEvent.type,
      occurredAt: when,
      sourceType: SOURCE_TYPES[demoEvent.via],
      sourceReference: isEmail ? `demo-message-${index + 1}` : null,
      classificationMethod: isEmail ? (demoEvent.method ?? "RULES") : null,
      confidence: isEmail ? (demoEvent.confidence ?? 0.97) : null,
      metadata: demoEvent.metadata,
      dedupeKey: `demo:${crypto.randomUUID()}`,
    });
    return {
      id: crypto.randomUUID(),
      input,
      recordedAt: new Date(
        when.getTime() + (isEmail ? EMAIL_DETECTION_DELAY_MS : 0),
      ),
    };
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

  return {
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
): Promise<{ applications: number; events: number }> {
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

    return { applications: plans.length, events: events.length };
  });
}

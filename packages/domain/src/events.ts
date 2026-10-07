import { z } from "zod";
import {
  applicationStatusSchema,
  interviewTypeSchema,
  type ApplicationEventType,
} from "./enums";

const isoDateTime = z.iso.datetime({ offset: true });

const noMetadata = z.object({});

const interviewMetadata = z.object({
  interviewKind: interviewTypeSchema.optional(),
  scheduledAt: isoDateTime.optional(),
  isFinalRound: z.boolean().optional(),
});

/**
 * Metadata accepted for each event type. Stored as JSON on the event, so dates
 * are ISO strings. Unknown keys are stripped.
 */
export const eventMetadataSchemas = {
  JOB_SAVED: noMetadata,
  APPLICATION_SUBMITTED: noMetadata,
  APPLICATION_CONFIRMATION_RECEIVED: noMetadata,
  ASSESSMENT_RECEIVED: noMetadata,
  RECRUITER_CONTACT: noMetadata,
  INTERVIEW_REQUESTED: interviewMetadata,
  INTERVIEW_SCHEDULED: interviewMetadata,
  INTERVIEW_RESCHEDULED: interviewMetadata,
  NEXT_ROUND: z.object({ isFinalRound: z.boolean().optional() }),
  OFFER_RECEIVED: noMetadata,
  REJECTION_RECEIVED: noMetadata,
  APPLICATION_WITHDRAWN: noMetadata,
  FOLLOW_UP_SENT: noMetadata,
  STATUS_OVERRIDDEN: z.object({ toStatus: applicationStatusSchema }),
} satisfies Record<ApplicationEventType, z.ZodType>;

export type EventMetadata<T extends ApplicationEventType> = z.infer<
  (typeof eventMetadataSchemas)[T]
>;

/** Validates metadata for an event type. Missing metadata is treated as empty. */
export function parseEventMetadata<T extends ApplicationEventType>(
  type: T,
  value: unknown,
): EventMetadata<T> {
  return eventMetadataSchemas[type].parse(value ?? {}) as EventMetadata<T>;
}

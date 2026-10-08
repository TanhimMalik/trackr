import {
  APPLICATION_EVENT_TYPES,
  APPLICATION_SOURCES,
  APPLICATION_STATUSES,
  CLASSIFICATION_METHODS,
  CONTACT_TYPES,
  EMPLOYMENT_TYPES,
  EVENT_SOURCE_TYPES,
  INTERVIEW_STATUSES,
  INTERVIEW_TYPES,
  NOTIFICATION_TYPES,
  REVIEW_ITEM_KINDS,
  REVIEW_ITEM_STATES,
  REVIEW_RESOLUTIONS,
  SOURCE_PLATFORMS,
} from "@trackr/domain";
import { pgEnum } from "drizzle-orm/pg-core";

// Postgres enums mirror the domain package, which is the single source of truth.
// Values are only ever added; see docs/database.md.

export const applicationStatusEnum = pgEnum(
  "application_status",
  APPLICATION_STATUSES,
);

export const applicationEventTypeEnum = pgEnum(
  "application_event_type",
  APPLICATION_EVENT_TYPES,
);

export const eventSourceTypeEnum = pgEnum(
  "event_source_type",
  EVENT_SOURCE_TYPES,
);

export const sourcePlatformEnum = pgEnum("source_platform", SOURCE_PLATFORMS);

export const applicationSourceEnum = pgEnum(
  "application_source",
  APPLICATION_SOURCES,
);

export const employmentTypeEnum = pgEnum("employment_type", EMPLOYMENT_TYPES);

export const classificationMethodEnum = pgEnum(
  "classification_method",
  CLASSIFICATION_METHODS,
);

export const interviewTypeEnum = pgEnum("interview_type", INTERVIEW_TYPES);

export const interviewStatusEnum = pgEnum(
  "interview_status",
  INTERVIEW_STATUSES,
);

export const contactTypeEnum = pgEnum("contact_type", CONTACT_TYPES);

export const notificationTypeEnum = pgEnum(
  "notification_type",
  NOTIFICATION_TYPES,
);

export const reviewItemKindEnum = pgEnum("review_item_kind", REVIEW_ITEM_KINDS);

export const reviewItemStateEnum = pgEnum(
  "review_item_state",
  REVIEW_ITEM_STATES,
);

export const reviewResolutionEnum = pgEnum(
  "review_resolution",
  REVIEW_RESOLUTIONS,
);

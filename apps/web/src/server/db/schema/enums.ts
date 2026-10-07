import {
  APPLICATION_EVENT_TYPES,
  APPLICATION_SOURCES,
  APPLICATION_STATUSES,
  CLASSIFICATION_METHODS,
  EMPLOYMENT_TYPES,
  EVENT_SOURCE_TYPES,
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

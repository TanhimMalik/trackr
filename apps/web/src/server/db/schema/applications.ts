import { sql } from "drizzle-orm";
import {
  char,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./columns";
import {
  applicationSourceEnum,
  applicationStatusEnum,
  employmentTypeEnum,
  sourcePlatformEnum,
} from "./enums";
import { resumeVersions } from "./resume-versions";
import { users } from "./users";

export const applications = pgTable(
  "applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    companyName: text("company_name").notNull(),
    companyNameNorm: text("company_name_norm").notNull(),
    companyDomain: text("company_domain"),

    jobTitle: text("job_title").notNull(),
    jobTitleNorm: text("job_title_norm").notNull(),
    jobUrl: text("job_url"),
    atsJobId: text("ats_job_id"),
    jobDescription: text("job_description"),

    location: text("location"),
    employmentType: employmentTypeEnum("employment_type"),
    salaryMin: integer("salary_min"),
    salaryMax: integer("salary_max"),
    salaryCurrency: char("salary_currency", { length: 3 }),

    source: applicationSourceEnum("source"),
    sourcePlatform: sourcePlatformEnum("source_platform")
      .notNull()
      .default("OTHER"),

    // Derived from events; written only by the event processor.
    currentStatus: applicationStatusEnum("current_status")
      .notNull()
      .default("UNKNOWN"),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    resumeVersionId: uuid("resume_version_id").references(
      () => resumeVersions.id,
      { onDelete: "set null" },
    ),
    notes: text("notes"),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("applications_user_status_idx").on(table.userId, table.currentStatus),
    index("applications_user_last_activity_idx").on(
      table.userId,
      table.lastActivityAt.desc(),
    ),
    index("applications_user_company_idx").on(
      table.userId,
      table.companyNameNorm,
    ),
    // Race-proof backstop against recording the same job posting twice.
    uniqueIndex("applications_user_platform_ats_job_unique")
      .on(table.userId, table.sourcePlatform, table.atsJobId)
      .where(sql`${table.atsJobId} is not null`),
    // Lets child tables require that a row belongs to the same user as its application.
    unique("applications_id_user_id_unique").on(table.id, table.userId),
    check(
      "applications_salary_non_negative",
      sql`coalesce(${table.salaryMin}, 0) >= 0 and coalesce(${table.salaryMax}, 0) >= 0`,
    ),
    check(
      "applications_salary_range",
      sql`${table.salaryMin} is null or ${table.salaryMax} is null or ${table.salaryMin} <= ${table.salaryMax}`,
    ),
    check(
      "applications_salary_currency_format",
      sql`${table.salaryCurrency} is null or ${table.salaryCurrency} ~ '^[A-Z]{3}$'`,
    ),
  ],
).enableRLS();

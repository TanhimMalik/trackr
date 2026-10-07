import "server-only";
import {
  RESPONSE_EVENT_TYPES,
  RESPONSE_STATUSES,
  detectSourcePlatform,
  domainFromWebsite,
  employerDomainFromJobUrl,
  normalizeCompanyName,
  normalizeJobTitle,
  type ApplicationStatus,
} from "@trackr/domain";
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  gte,
  ilike,
  inArray,
  isNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { z } from "zod";
import {
  createApplicationSchema,
  selectableStatusSchema,
  updateApplicationSchema,
  type CreateApplicationInput,
  type UpdateApplicationInput,
} from "@/lib/applications/input";
import {
  EMPTY_FILTERS,
  type ApplicationFilters,
  type ApplicationSort,
} from "@/lib/applications/filters";
import { getDb } from "@/server/db/client";
import {
  applicationEvents,
  applications,
  resumeVersions,
} from "@/server/db/schema";
import type {
  Application,
  ApplicationEvent,
  Database,
} from "@/server/db/types";
import { NotFoundError } from "./errors";
import {
  insertEvent,
  processApplicationEvent,
  recomputeApplicationState,
  validateEventInput,
  type ApplicationEventInput,
  type ProcessedEvent,
} from "./events";

const manualDedupeKey = () => `manual:${crypto.randomUUID()}`;

function ownedApplication(userId: string, applicationId: string) {
  return and(
    eq(applications.id, applicationId),
    eq(applications.userId, userId),
  );
}

async function assertResumeOwnership(
  db: Database,
  userId: string,
  resumeVersionId: string | null | undefined,
) {
  if (!resumeVersionId) return;
  const [resume] = await db
    .select({ id: resumeVersions.id })
    .from(resumeVersions)
    .where(
      and(
        eq(resumeVersions.id, resumeVersionId),
        eq(resumeVersions.userId, userId),
      ),
    );
  if (!resume) throw new NotFoundError("Resume");
}

/**
 * The events that record how a manually added application reached its starting
 * status: saved, or submitted and (for later stages) moved on by the user.
 */
function initialEvents(
  status: ApplicationStatus,
  appliedAt: Date,
  now: Date,
): Omit<ApplicationEventInput, "userId" | "applicationId">[] {
  if (status === "SAVED") {
    return [
      {
        type: "JOB_SAVED",
        occurredAt: now,
        sourceType: "MANUAL",
        dedupeKey: manualDedupeKey(),
      },
    ];
  }

  const submitted = {
    type: "APPLICATION_SUBMITTED" as const,
    occurredAt: appliedAt,
    sourceType: "MANUAL" as const,
    dedupeKey: manualDedupeKey(),
  };
  if (status === "APPLIED") return [submitted];

  // Recorded strictly after the submission so replay applies it second.
  const overrideAt = new Date(Math.max(now.getTime(), appliedAt.getTime() + 1));
  return [
    submitted,
    {
      type: "STATUS_OVERRIDDEN",
      occurredAt: overrideAt,
      sourceType: "MANUAL",
      metadata: { toStatus: status },
      dedupeKey: manualDedupeKey(),
    },
  ];
}

/** Adds an application by hand, with the events that explain its status. */
/** The company's domain: the website given, else the employer's own job site. */
function companyDomainFor(
  companyWebsite: string | null | undefined,
  jobUrl: string | null | undefined,
): string | null {
  return (
    (companyWebsite ? domainFromWebsite(companyWebsite) : null) ??
    employerDomainFromJobUrl(jobUrl)
  );
}

/**
 * Row values for a new application from validated input, with derived fields
 * (normalized names, company domain, platform). Status fields are left at
 * their defaults for the event processor to set.
 */
export function newApplicationValues(
  userId: string,
  data: z.output<typeof createApplicationSchema>,
): typeof applications.$inferInsert {
  return {
    userId,
    companyName: data.companyName,
    companyNameNorm: normalizeCompanyName(data.companyName),
    companyDomain: companyDomainFor(data.companyWebsite, data.jobUrl),
    jobTitle: data.jobTitle,
    jobTitleNorm: normalizeJobTitle(data.jobTitle),
    jobUrl: data.jobUrl ?? null,
    jobDescription: data.jobDescription ?? null,
    location: data.location ?? null,
    employmentType: data.employmentType ?? null,
    salaryMin: data.salaryMin ?? null,
    salaryMax: data.salaryMax ?? null,
    salaryCurrency: data.salaryCurrency ?? null,
    source: data.source ?? null,
    sourcePlatform: data.sourcePlatform ?? detectSourcePlatform(data.jobUrl),
    resumeVersionId: data.resumeVersionId ?? null,
    notes: data.notes ?? null,
  };
}

export async function createApplication(
  userId: string,
  input: CreateApplicationInput,
  db: Database = getDb(),
): Promise<Application> {
  const data = createApplicationSchema.parse(input);
  await assertResumeOwnership(db, userId, data.resumeVersionId);

  const now = new Date();
  return db.transaction(async (tx) => {
    const [application] = await tx
      .insert(applications)
      .values({ ...newApplicationValues(userId, data), lastActivityAt: now })
      .returning();

    for (const event of initialEvents(
      data.status,
      data.appliedAt ?? now,
      now,
    )) {
      await insertEvent(
        tx,
        validateEventInput({
          ...event,
          userId,
          applicationId: application!.id,
        }),
      );
    }
    await recomputeApplicationState(tx, userId, application!.id);

    const [created] = await tx
      .select()
      .from(applications)
      .where(eq(applications.id, application!.id));
    return created!;
  });
}

/** Edits an application's details. Status and dates change only through events. */
export async function updateApplication(
  userId: string,
  applicationId: string,
  input: UpdateApplicationInput,
  db: Database = getDb(),
): Promise<Application> {
  const patch = updateApplicationSchema.parse(input);
  const [existing] = await db
    .select()
    .from(applications)
    .where(ownedApplication(userId, applicationId));
  if (!existing) throw new NotFoundError("Application");

  // Check the salary range against stored values the patch leaves unchanged.
  updateApplicationSchema.parse({
    salaryMin:
      patch.salaryMin !== undefined ? patch.salaryMin : existing.salaryMin,
    salaryMax:
      patch.salaryMax !== undefined ? patch.salaryMax : existing.salaryMax,
  });
  await assertResumeOwnership(db, userId, patch.resumeVersionId);

  const { sourcePlatform, companyWebsite, ...fields } = patch;
  const values: Partial<typeof applications.$inferInsert> = { ...fields };
  if (patch.companyName !== undefined) {
    values.companyNameNorm = normalizeCompanyName(patch.companyName);
  }
  if (patch.jobTitle !== undefined) {
    values.jobTitleNorm = normalizeJobTitle(patch.jobTitle);
  }
  if (companyWebsite !== undefined) {
    // Clearing the website falls back to the employer's own job site, if any.
    values.companyDomain = companyDomainFor(
      companyWebsite,
      patch.jobUrl !== undefined ? patch.jobUrl : existing.jobUrl,
    );
  } else if (patch.jobUrl !== undefined) {
    // A new link to the employer's own site updates the domain; a job-board
    // link says nothing about the company, so the stored domain is kept.
    values.companyDomain =
      employerDomainFromJobUrl(patch.jobUrl) ?? existing.companyDomain;
  }
  // Clearing the platform falls back to detecting it from the job URL.
  if (sourcePlatform !== undefined) {
    values.sourcePlatform =
      sourcePlatform ??
      detectSourcePlatform(
        patch.jobUrl !== undefined ? patch.jobUrl : existing.jobUrl,
      );
  }

  const [updated] = await db
    .update(applications)
    .set(values)
    .where(ownedApplication(userId, applicationId))
    .returning();
  return updated!;
}

/**
 * Records a manual status change, for example from dragging a board card. A
 * change to the current status records nothing.
 */
export async function changeApplicationStatus(
  userId: string,
  applicationId: string,
  toStatus: ApplicationStatus,
  db: Database = getDb(),
): Promise<ProcessedEvent | null> {
  const status = selectableStatusSchema.parse(toStatus);
  const [existing] = await db
    .select({ currentStatus: applications.currentStatus })
    .from(applications)
    .where(ownedApplication(userId, applicationId));
  if (!existing) throw new NotFoundError("Application");
  if (existing.currentStatus === status) return null;

  return processApplicationEvent(
    {
      userId,
      applicationId,
      type: "STATUS_OVERRIDDEN",
      occurredAt: new Date(),
      sourceType: "MANUAL",
      metadata: { toStatus: status },
      dedupeKey: manualDedupeKey(),
    },
    db,
  );
}

/** Deletes an application and, through cascades, its history. */
export async function deleteApplication(
  userId: string,
  applicationId: string,
  db: Database = getDb(),
): Promise<void> {
  const deleted = await db
    .delete(applications)
    .where(ownedApplication(userId, applicationId))
    .returning({ id: applications.id });
  if (deleted.length === 0) throw new NotFoundError("Application");
}

/** Deletes every application the user has, with their history. Returns how many. */
export async function deleteAllApplications(
  userId: string,
  db: Database = getDb(),
): Promise<number> {
  const deleted = await db
    .delete(applications)
    .where(eq(applications.userId, userId))
    .returning({ id: applications.id });
  return deleted.length;
}

export type ApplicationWithEvents = {
  application: Application;
  /** In the order they happened. */
  events: ApplicationEvent[];
};

export async function getApplication(
  userId: string,
  applicationId: string,
  db: Database = getDb(),
): Promise<ApplicationWithEvents> {
  const [application] = await db
    .select()
    .from(applications)
    .where(ownedApplication(userId, applicationId));
  if (!application) throw new NotFoundError("Application");

  const events = await db
    .select()
    .from(applicationEvents)
    .where(
      and(
        eq(applicationEvents.applicationId, applicationId),
        eq(applicationEvents.userId, userId),
      ),
    )
    .orderBy(
      asc(applicationEvents.eventTimestamp),
      asc(applicationEvents.createdAt),
    );

  return { application, events };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Escapes LIKE wildcards so a search for "100%" matches literally. */
const likePattern = (query: string) =>
  `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

/** Whether the company has responded: the same definition the analytics use. */
const hasResponded = exists(
  sql`(select 1 from ${applicationEvents} where ${and(
    eq(applicationEvents.applicationId, applications.id),
    isNull(applicationEvents.revertedAt),
    or(
      inArray(applicationEvents.eventType, RESPONSE_EVENT_TYPES),
      and(
        eq(applicationEvents.eventType, "STATUS_OVERRIDDEN"),
        inArray(applicationEvents.statusAfter, RESPONSE_STATUSES),
      ),
    ),
  )})`,
);

// Active stages first, most advanced at the top, then closed applications.
const STATUS_ORDER = sql`case ${applications.currentStatus}
  when 'OFFER' then 0 when 'FINAL_ROUND' then 1 when 'INTERVIEW' then 2
  when 'RECRUITER_SCREEN' then 3 when 'ASSESSMENT' then 4 when 'APPLIED' then 5
  when 'SAVED' then 6 when 'UNKNOWN' then 7 when 'WITHDRAWN' then 8
  else 9 end`;

const ORDER_BY: Record<ApplicationSort, SQL[]> = {
  updated: [desc(applications.lastActivityAt)],
  newest: [sql`${applications.appliedAt} desc nulls last`],
  oldest: [sql`${applications.appliedAt} asc nulls last`],
  company: [asc(applications.companyNameNorm), asc(applications.jobTitleNorm)],
  status: [STATUS_ORDER, desc(applications.lastActivityAt)],
};

/** The user's applications matching the filters, in the requested order. */
export async function listApplications(
  userId: string,
  filters: Partial<ApplicationFilters> = {},
  db: Database = getDb(),
  now: Date = new Date(),
): Promise<Application[]> {
  const { query, statuses, sources, appliedWithin, response, sort } = {
    ...EMPTY_FILTERS,
    ...filters,
  };

  const conditions: (SQL | undefined)[] = [eq(applications.userId, userId)];
  if (query) {
    const pattern = likePattern(query);
    conditions.push(
      or(
        ilike(applications.companyName, pattern),
        ilike(applications.jobTitle, pattern),
        ilike(applications.location, pattern),
      ),
    );
  }
  if (statuses.length) {
    conditions.push(inArray(applications.currentStatus, statuses));
  }
  if (sources.length) conditions.push(inArray(applications.source, sources));
  if (appliedWithin) {
    const cutoff = new Date(now.getTime() - Number(appliedWithin) * DAY_MS);
    conditions.push(gte(applications.appliedAt, cutoff));
  }
  if (response === "responded") conditions.push(hasResponded);
  if (response === "waiting") conditions.push(sql`not ${hasResponded}`);

  return db
    .select()
    .from(applications)
    .where(and(...conditions))
    .orderBy(...ORDER_BY[sort], desc(applications.createdAt));
}

/** How many applications the user has in total, ignoring any filters. */
export async function countApplications(
  userId: string,
  db: Database = getDb(),
): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(applications)
    .where(eq(applications.userId, userId));
  return row?.total ?? 0;
}

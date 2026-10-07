import "server-only";
import {
  detectSourcePlatform,
  employerDomainFromJobUrl,
  normalizeCompanyName,
  normalizeJobTitle,
  type ApplicationStatus,
} from "@trackr/domain";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  createApplicationSchema,
  selectableStatusSchema,
  updateApplicationSchema,
  type CreateApplicationInput,
  type UpdateApplicationInput,
} from "@/lib/applications/input";
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
      .values({
        userId,
        companyName: data.companyName,
        companyNameNorm: normalizeCompanyName(data.companyName),
        companyDomain: employerDomainFromJobUrl(data.jobUrl),
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
        sourcePlatform:
          data.sourcePlatform ?? detectSourcePlatform(data.jobUrl),
        resumeVersionId: data.resumeVersionId ?? null,
        notes: data.notes ?? null,
        lastActivityAt: now,
      })
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

  const { sourcePlatform, ...fields } = patch;
  const values: Partial<typeof applications.$inferInsert> = { ...fields };
  if (patch.companyName !== undefined) {
    values.companyNameNorm = normalizeCompanyName(patch.companyName);
  }
  if (patch.jobTitle !== undefined) {
    values.jobTitleNorm = normalizeJobTitle(patch.jobTitle);
  }
  if (patch.jobUrl !== undefined) {
    values.companyDomain = employerDomainFromJobUrl(patch.jobUrl);
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

/** The user's applications, most recently active first. */
export async function listApplications(
  userId: string,
  db: Database = getDb(),
): Promise<Application[]> {
  return db
    .select()
    .from(applications)
    .where(eq(applications.userId, userId))
    .orderBy(desc(applications.lastActivityAt));
}

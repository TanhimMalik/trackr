import {
  applicationSourceSchema,
  APPLICATION_STATUSES,
  employmentTypeSchema,
  sourcePlatformSchema,
  type ApplicationStatus,
} from "@trackr/domain";
import { z } from "zod";

/** Optional text: trimmed, with blank values stored as null. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters.`)
    .transform((value) => value || null)
    .nullish();

const jobUrl = z
  .string()
  .trim()
  .max(2048)
  .transform((value) => value || null)
  .pipe(
    z
      .url({
        protocol: /^https?$/,
        error: "Enter a full link, starting with https://",
      })
      .nullable(),
  )
  .nullish();

const salary = z
  .number()
  .int("Use a whole number.")
  .min(0, "Salary can't be negative.")
  .max(100_000_000)
  .nullish();

/** Statuses a person can choose; Unknown is only ever assigned by the system. */
export const SELECTABLE_STATUSES = APPLICATION_STATUSES.filter(
  (status) => status !== "UNKNOWN",
) as Exclude<ApplicationStatus, "UNKNOWN">[];
export const selectableStatusSchema = z.enum(SELECTABLE_STATUSES);

const applicationFields = z.object({
  companyName: z
    .string()
    .trim()
    .min(1, "Enter the company.")
    .max(200, "Use at most 200 characters."),
  jobTitle: z
    .string()
    .trim()
    .min(1, "Enter the role.")
    .max(200, "Use at most 200 characters."),
  jobUrl,
  location: optionalText(200),
  employmentType: employmentTypeSchema.nullish(),
  salaryMin: salary,
  salaryMax: salary,
  salaryCurrency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Use a three-letter currency code, like USD.")
    .nullish(),
  source: applicationSourceSchema.nullish(),
  sourcePlatform: sourcePlatformSchema.nullish(),
  jobDescription: optionalText(50_000),
  notes: optionalText(10_000),
  resumeVersionId: z.uuid().nullish(),
});

type SalaryRange = {
  salaryMin?: number | null;
  salaryMax?: number | null;
};

function checkSalaryRange(value: SalaryRange, ctx: z.RefinementCtx) {
  if (
    value.salaryMin != null &&
    value.salaryMax != null &&
    value.salaryMin > value.salaryMax
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["salaryMax"],
      message: "Maximum must be at least the minimum.",
    });
  }
}

// Allows for clock differences between the browser and the server.
const FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000;

export const createApplicationSchema = applicationFields
  .extend({
    status: selectableStatusSchema.default("APPLIED"),
    /** When the application was submitted. Defaults to now; ignored for saved jobs. */
    appliedAt: z.coerce
      .date()
      .refine(
        (date) => date.getTime() <= Date.now() + FUTURE_TOLERANCE_MS,
        "The applied date can't be in the future.",
      )
      .nullish(),
  })
  .superRefine(checkSalaryRange);

export type CreateApplicationInput = z.input<typeof createApplicationSchema>;

/** Editable fields. Status and dates are changed through events, not edits. */
export const updateApplicationSchema = applicationFields
  .partial()
  .superRefine(checkSalaryRange);

export type UpdateApplicationInput = z.input<typeof updateApplicationSchema>;

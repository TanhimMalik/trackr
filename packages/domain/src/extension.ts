import { z } from "zod";
import { sourcePlatformSchema } from "./enums";

export const CAPTURE_MODES = ["AUTO", "POPUP"] as const;
export type CaptureMode = (typeof CAPTURE_MODES)[number];

const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => value || null);

/**
 * What the extension reports when an application is submitted, or tracked
 * from the popup. Shared by the extension and the API.
 */
export const extensionSubmissionSchema = z.object({
  clientSubmissionId: z.uuid(),
  captureMode: z.enum(CAPTURE_MODES),
  platform: sourcePlatformSchema,
  companyName: text(200),
  jobTitle: text(200),
  jobUrl: z.url({ protocol: /^https?$/ }).max(2000),
  atsJobId: optionalText(200),
  location: optionalText(200),
  description: optionalText(50_000),
  submittedAt: z.iso
    .datetime({ offset: true })
    .refine(
      (value) => new Date(value).getTime() <= Date.now() + FUTURE_TOLERANCE_MS,
      "Submission time can't be in the future.",
    ),
});

export type ExtensionSubmissionPayload = z.input<
  typeof extensionSubmissionSchema
>;
export type ExtensionSubmission = z.output<typeof extensionSubmissionSchema>;

export const SUBMISSION_OUTCOMES = [
  "CREATED",
  "MATCHED_EXISTING",
  "POSSIBLE_DUPLICATE",
] as const;
export type SubmissionOutcome = (typeof SUBMISSION_OUTCOMES)[number];

export type ExtensionSubmissionResponse = {
  applicationId: string;
  outcome: SubmissionOutcome;
};

import {
  contactTypeSchema,
  interviewStatusSchema,
  interviewTypeSchema,
  type ApplicationEventType,
} from "@trackr/domain";
import { z } from "zod";
import { optional, text } from "./form-data";
import { optionalLink, optionalText } from "./input";

/**
 * Input for contacts, interviews and activity logged by hand. Shared by the
 * forms (client) and their server actions.
 */

const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(320)
  .transform((value) => value || null)
  .pipe(z.email("Enter a valid email address.").nullable())
  .nullish();

const timestamp = (message: string) =>
  z.iso
    .datetime({ offset: true, error: message })
    .transform((value) => new Date(value));

export const contactInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a name.")
    .max(200, "Use at most 200 characters."),
  email: optionalEmail,
  title: optionalText(200),
  contactType: contactTypeSchema.default("OTHER"),
});
export type ContactInput = z.input<typeof contactInputSchema>;

export const interviewInputSchema = z.object({
  interviewType: interviewTypeSchema.default("OTHER"),
  scheduledAt: timestamp("Pick a date and time.").nullish(),
  durationMinutes: z
    .number({ error: "Enter the length in minutes." })
    .int("Use whole minutes.")
    .min(1, "Use at least 1 minute.")
    .max(1440, "Use at most 24 hours.")
    .nullish(),
  meetingUrl: optionalLink,
  location: optionalText(200),
  contactId: z.uuid().nullish(),
  status: interviewStatusSchema.default("SCHEDULED"),
});
export type InterviewInput = z.input<typeof interviewInputSchema>;

/** What a person can record by hand; the rest comes from the system or the status menu. */
export const LOGGABLE_EVENTS = {
  RECRUITER_CONTACT: "A recruiter reached out",
  ASSESSMENT_RECEIVED: "Received an assessment",
  INTERVIEW_REQUESTED: "Invited to interview",
  INTERVIEW_SCHEDULED: "Scheduled an interview",
  NEXT_ROUND: "Moved to the next round",
  OFFER_RECEIVED: "Received an offer",
  REJECTION_RECEIVED: "Got a rejection",
  APPLICATION_WITHDRAWN: "Withdrew the application",
  FOLLOW_UP_SENT: "Sent a follow-up",
} as const satisfies Partial<Record<ApplicationEventType, string>>;
export type LoggableEventType = keyof typeof LOGGABLE_EVENTS;

const LOGGABLE_TYPES = Object.keys(LOGGABLE_EVENTS) as [
  LoggableEventType,
  ...LoggableEventType[],
];

// A little slack for clocks that run slightly ahead.
const FUTURE_SLACK_MS = 5 * 60 * 1000;

export const activityInputSchema = z
  .object({
    type: z.enum(LOGGABLE_TYPES, { error: "Choose what happened." }),
    occurredAt: timestamp("Pick the date it happened."),
    interviewKind: interviewTypeSchema.nullish(),
    scheduledAt: timestamp("Pick the interview's date and time.").nullish(),
    isFinalRound: z.boolean().default(false),
  })
  .refine(
    (input) => input.occurredAt.getTime() <= Date.now() + FUTURE_SLACK_MS,
    { path: ["occurredAt"], message: "Pick today or an earlier date." },
  )
  .refine(
    (input) => input.type !== "INTERVIEW_SCHEDULED" || input.scheduledAt,
    { path: ["scheduledAt"], message: "Pick the interview's date and time." },
  );
export type ActivityInput = z.input<typeof activityInputSchema>;

/** Minutes typed into the form; anything unreadable becomes NaN for validation to report. */
function minutes(value: string | null | undefined): number | null {
  if (value == null || value.trim() === "") return null;
  return /^\d+$/.test(value.trim()) ? Number(value.trim()) : Number.NaN;
}

export function contactFormValues(formData: FormData) {
  return {
    name: text(formData, "name") ?? "",
    email: optional(formData, "email"),
    title: optional(formData, "title"),
    contactType: optional(formData, "contactType") ?? undefined,
  };
}

export function interviewFormValues(formData: FormData) {
  return {
    interviewType: optional(formData, "interviewType") ?? undefined,
    scheduledAt: optional(formData, "scheduledAt"),
    durationMinutes: minutes(text(formData, "durationMinutes")),
    meetingUrl: optional(formData, "meetingUrl"),
    location: optional(formData, "location"),
    contactId: optional(formData, "contactId"),
    status: optional(formData, "status") ?? undefined,
  };
}

export function activityFormValues(formData: FormData) {
  return {
    type: optional(formData, "type") ?? "",
    occurredAt: optional(formData, "occurredAt") ?? "",
    interviewKind: optional(formData, "interviewKind"),
    scheduledAt: optional(formData, "scheduledAt"),
    isFinalRound: formData.get("isFinalRound") === "on",
  };
}

/**
 * A datetime-local value ("2026-10-09T14:00") in the browser's time zone as
 * an ISO timestamp, for sending to the server.
 */
export function localDateTimeToIso(
  value: string | null | undefined,
): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/** The value a datetime-local input expects for a moment, in local time. */
export function localDateTimeInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

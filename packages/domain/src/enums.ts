import { z } from "zod";

/**
 * Domain enumerations. Each is declared once as a const array, which yields the
 * TypeScript union, the zod schema and (in the web app) the Postgres enum.
 */

export const APPLICATION_STATUSES = [
  "SAVED",
  "APPLIED",
  "ASSESSMENT",
  "RECRUITER_SCREEN",
  "INTERVIEW",
  "FINAL_ROUND",
  "OFFER",
  "REJECTED",
  "WITHDRAWN",
  "UNKNOWN",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
export const applicationStatusSchema = z.enum(APPLICATION_STATUSES);

export const APPLICATION_EVENT_TYPES = [
  "JOB_SAVED",
  "APPLICATION_SUBMITTED",
  "APPLICATION_CONFIRMATION_RECEIVED",
  "ASSESSMENT_RECEIVED",
  "RECRUITER_CONTACT",
  "INTERVIEW_REQUESTED",
  "INTERVIEW_SCHEDULED",
  "INTERVIEW_RESCHEDULED",
  "NEXT_ROUND",
  "OFFER_RECEIVED",
  "REJECTION_RECEIVED",
  "APPLICATION_WITHDRAWN",
  "FOLLOW_UP_SENT",
  "STATUS_OVERRIDDEN",
] as const;
export type ApplicationEventType = (typeof APPLICATION_EVENT_TYPES)[number];
export const applicationEventTypeSchema = z.enum(APPLICATION_EVENT_TYPES);

export const EVENT_SOURCE_TYPES = [
  "BROWSER_EXTENSION",
  "EMAIL",
  "MANUAL",
  "SYSTEM",
] as const;
export type EventSourceType = (typeof EVENT_SOURCE_TYPES)[number];
export const eventSourceTypeSchema = z.enum(EVENT_SOURCE_TYPES);

/** Where an application was submitted or hosted. */
export const SOURCE_PLATFORMS = [
  "LINKEDIN",
  "GREENHOUSE",
  "LEVER",
  "ASHBY",
  "WORKDAY",
  "ICIMS",
  "COMPANY_SITE",
  "INDEED",
  "OTHER",
] as const;
export type SourcePlatform = (typeof SOURCE_PLATFORMS)[number];
export const sourcePlatformSchema = z.enum(SOURCE_PLATFORMS);

/** Where the user found the job. */
export const APPLICATION_SOURCES = [
  "LINKEDIN",
  "INDEED",
  "COMPANY_SITE",
  "REFERRAL",
  "HANDSHAKE",
  "OTHER",
] as const;
export type ApplicationSource = (typeof APPLICATION_SOURCES)[number];
export const applicationSourceSchema = z.enum(APPLICATION_SOURCES);

export const EMPLOYMENT_TYPES = [
  "FULL_TIME",
  "PART_TIME",
  "CONTRACT",
  "INTERNSHIP",
  "TEMPORARY",
  "OTHER",
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];
export const employmentTypeSchema = z.enum(EMPLOYMENT_TYPES);

/** How an automatic event was classified. */
export const CLASSIFICATION_METHODS = ["RULES", "LLM"] as const;
export type ClassificationMethod = (typeof CLASSIFICATION_METHODS)[number];
export const classificationMethodSchema = z.enum(CLASSIFICATION_METHODS);

export const INTERVIEW_TYPES = [
  "RECRUITER_SCREEN",
  "TECHNICAL",
  "HIRING_MANAGER",
  "ONSITE",
  "FINAL",
  "OTHER",
] as const;
export type InterviewType = (typeof INTERVIEW_TYPES)[number];
export const interviewTypeSchema = z.enum(INTERVIEW_TYPES);

CREATE TYPE "public"."application_event_type" AS ENUM('JOB_SAVED', 'APPLICATION_SUBMITTED', 'APPLICATION_CONFIRMATION_RECEIVED', 'ASSESSMENT_RECEIVED', 'RECRUITER_CONTACT', 'INTERVIEW_REQUESTED', 'INTERVIEW_SCHEDULED', 'INTERVIEW_RESCHEDULED', 'NEXT_ROUND', 'OFFER_RECEIVED', 'REJECTION_RECEIVED', 'APPLICATION_WITHDRAWN', 'FOLLOW_UP_SENT', 'STATUS_OVERRIDDEN');--> statement-breakpoint
CREATE TYPE "public"."application_source" AS ENUM('LINKEDIN', 'INDEED', 'COMPANY_SITE', 'REFERRAL', 'HANDSHAKE', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."application_status" AS ENUM('SAVED', 'APPLIED', 'ASSESSMENT', 'RECRUITER_SCREEN', 'INTERVIEW', 'FINAL_ROUND', 'OFFER', 'REJECTED', 'WITHDRAWN', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."classification_method" AS ENUM('RULES', 'LLM');--> statement-breakpoint
CREATE TYPE "public"."employment_type" AS ENUM('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'TEMPORARY', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."event_source_type" AS ENUM('BROWSER_EXTENSION', 'EMAIL', 'MANUAL', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."source_platform" AS ENUM('LINKEDIN', 'GREENHOUSE', 'LEVER', 'ASHBY', 'WORKDAY', 'ICIMS', 'COMPANY_SITE', 'INDEED', 'OTHER');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "resume_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"storage_path" text,
	"original_filename" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "resume_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"company_name" text NOT NULL,
	"company_name_norm" text NOT NULL,
	"company_domain" text,
	"job_title" text NOT NULL,
	"job_title_norm" text NOT NULL,
	"job_url" text,
	"ats_job_id" text,
	"job_description" text,
	"location" text,
	"employment_type" "employment_type",
	"salary_min" integer,
	"salary_max" integer,
	"salary_currency" char(3),
	"source" "application_source",
	"source_platform" "source_platform" DEFAULT 'OTHER' NOT NULL,
	"current_status" "application_status" DEFAULT 'UNKNOWN' NOT NULL,
	"applied_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resume_version_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "applications_id_user_id_unique" UNIQUE("id","user_id"),
	CONSTRAINT "applications_salary_non_negative" CHECK (coalesce("applications"."salary_min", 0) >= 0 and coalesce("applications"."salary_max", 0) >= 0),
	CONSTRAINT "applications_salary_range" CHECK ("applications"."salary_min" is null or "applications"."salary_max" is null or "applications"."salary_min" <= "applications"."salary_max"),
	CONSTRAINT "applications_salary_currency_format" CHECK ("applications"."salary_currency" is null or "applications"."salary_currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
ALTER TABLE "applications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "application_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"event_type" "application_event_type" NOT NULL,
	"event_timestamp" timestamp with time zone NOT NULL,
	"source_type" "event_source_type" NOT NULL,
	"source_reference" text,
	"classification_method" "classification_method",
	"confidence" real,
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dedupe_key" text NOT NULL,
	"status_before" "application_status",
	"status_after" "application_status",
	"reverted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "application_events_user_dedupe_key_unique" UNIQUE("user_id","dedupe_key"),
	CONSTRAINT "application_events_confidence_range" CHECK ("application_events"."confidence" is null or ("application_events"."confidence" >= 0 and "application_events"."confidence" <= 1))
);
--> statement-breakpoint
ALTER TABLE "application_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "resume_versions" ADD CONSTRAINT "resume_versions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_resume_version_id_resume_versions_id_fk" FOREIGN KEY ("resume_version_id") REFERENCES "public"."resume_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_application_fk" FOREIGN KEY ("application_id","user_id") REFERENCES "public"."applications"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "resume_versions_user_idx" ON "resume_versions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "applications_user_status_idx" ON "applications" USING btree ("user_id","current_status");--> statement-breakpoint
CREATE INDEX "applications_user_last_activity_idx" ON "applications" USING btree ("user_id","last_activity_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "applications_user_company_idx" ON "applications" USING btree ("user_id","company_name_norm");--> statement-breakpoint
CREATE UNIQUE INDEX "applications_user_platform_ats_job_unique" ON "applications" USING btree ("user_id","source_platform","ats_job_id") WHERE "applications"."ats_job_id" is not null;--> statement-breakpoint
CREATE INDEX "application_events_application_timestamp_idx" ON "application_events" USING btree ("application_id","event_timestamp");--> statement-breakpoint
CREATE INDEX "application_events_user_created_idx" ON "application_events" USING btree ("user_id","created_at" DESC NULLS LAST);
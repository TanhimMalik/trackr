CREATE TYPE "public"."contact_type" AS ENUM('RECRUITER', 'HIRING_MANAGER', 'INTERVIEWER', 'COORDINATOR', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."interview_status" AS ENUM('SCHEDULED', 'COMPLETED', 'CANCELED');--> statement-breakpoint
CREATE TYPE "public"."interview_type" AS ENUM('RECRUITER_SCREEN', 'TECHNICAL', 'HIRING_MANAGER', 'ONSITE', 'FINAL', 'OTHER');--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"title" text,
	"contact_type" "contact_type" DEFAULT 'OTHER' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contacts_application_email_unique" UNIQUE("application_id","email")
);
--> statement-breakpoint
ALTER TABLE "contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "interviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"interview_type" "interview_type" DEFAULT 'OTHER' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"duration_minutes" integer,
	"meeting_url" text,
	"location" text,
	"contact_id" uuid,
	"status" "interview_status" DEFAULT 'SCHEDULED' NOT NULL,
	"source_event_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "interviews_duration_range" CHECK ("interviews"."duration_minutes" is null or "interviews"."duration_minutes" between 1 and 1440)
);
--> statement-breakpoint
ALTER TABLE "interviews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_application_fk" FOREIGN KEY ("application_id","user_id") REFERENCES "public"."applications"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_source_event_id_application_events_id_fk" FOREIGN KEY ("source_event_id") REFERENCES "public"."application_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_application_fk" FOREIGN KEY ("application_id","user_id") REFERENCES "public"."applications"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "interviews_application_scheduled_idx" ON "interviews" USING btree ("application_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "interviews_user_scheduled_idx" ON "interviews" USING btree ("user_id","scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "interviews_source_event_unique" ON "interviews" USING btree ("source_event_id") WHERE "interviews"."source_event_id" is not null;
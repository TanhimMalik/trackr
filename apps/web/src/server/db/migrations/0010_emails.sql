CREATE TYPE "public"."email_classification" AS ENUM('APPLICATION_CONFIRMATION', 'ASSESSMENT', 'RECRUITER_CONTACT', 'INTERVIEW_REQUEST', 'INTERVIEW_CONFIRMATION', 'INTERVIEW_RESCHEDULE', 'NEXT_ROUND', 'OFFER', 'REJECTION', 'WITHDRAWAL', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."email_processing_status" AS ENUM('MATCHED', 'NEEDS_REVIEW', 'UNMATCHED', 'DISMISSED', 'IGNORED', 'FAILED');--> statement-breakpoint
CREATE TABLE "emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"integration_id" uuid,
	"gmail_message_id" text NOT NULL,
	"gmail_thread_id" text NOT NULL,
	"sender_email" text,
	"sender_name" text,
	"sender_domain" text,
	"subject" text,
	"snippet" text,
	"received_at" timestamp with time zone NOT NULL,
	"classification" "email_classification",
	"classification_confidence" real,
	"classification_method" "classification_method",
	"extracted_json" jsonb,
	"company_name" text,
	"job_title" text,
	"processing_status" "email_processing_status" NOT NULL,
	"application_id" uuid,
	"match_score" integer,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "emails_user_message_unique" UNIQUE("user_id","gmail_message_id")
);
--> statement-breakpoint
ALTER TABLE "emails" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "review_items" ADD COLUMN "email_id" uuid;--> statement-breakpoint
ALTER TABLE "integrations" ADD COLUMN "sync_locked_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_application_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "emails_user_status_idx" ON "emails" USING btree ("user_id","processing_status");--> statement-breakpoint
CREATE INDEX "emails_user_thread_idx" ON "emails" USING btree ("user_id","gmail_thread_id");--> statement-breakpoint
ALTER TABLE "review_items" ADD CONSTRAINT "review_items_email_id_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."emails"("id") ON DELETE cascade ON UPDATE no action;
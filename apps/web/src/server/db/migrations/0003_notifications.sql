CREATE TYPE "public"."notification_type" AS ENUM('STATUS_CHANGED', 'ASSESSMENT_RECEIVED', 'INTERVIEW_SCHEDULED', 'FOLLOW_UP_DUE', 'REVIEW_NEEDED', 'INTEGRATION_ERROR');--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"application_id" uuid,
	"event_id" uuid,
	"type" "notification_type" NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"read_at" timestamp with time zone,
	"dedupe_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_user_dedupe_unique" UNIQUE("user_id","dedupe_key")
);
--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_event_id_application_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."application_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_application_fk" FOREIGN KEY ("application_id","user_id") REFERENCES "public"."applications"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notifications_user_unread_idx" ON "notifications" USING btree ("user_id") WHERE "notifications"."read_at" is null;--> statement-breakpoint
CREATE INDEX "notifications_event_idx" ON "notifications" USING btree ("event_id") WHERE "notifications"."event_id" is not null;
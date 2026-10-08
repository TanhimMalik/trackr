CREATE TYPE "public"."review_item_kind" AS ENUM('POSSIBLE_DUPLICATE', 'EMAIL_POSSIBLE_MATCH', 'EMAIL_UNMATCHED', 'LOW_CONFIDENCE_UPDATE');--> statement-breakpoint
CREATE TYPE "public"."review_item_state" AS ENUM('OPEN', 'RESOLVED', 'DISMISSED');--> statement-breakpoint
CREATE TYPE "public"."review_resolution" AS ENUM('CONFIRMED', 'LINKED', 'CREATED', 'MERGED', 'DISMISSED');--> statement-breakpoint
CREATE TABLE "review_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "review_item_kind" NOT NULL,
	"state" "review_item_state" DEFAULT 'OPEN' NOT NULL,
	"application_id" uuid,
	"candidate_application_id" uuid,
	"proposed_event" jsonb,
	"match_score" integer,
	"match_reasons" jsonb,
	"resolution" "review_resolution",
	"dedupe_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "review_items_user_dedupe_unique" UNIQUE("user_id","dedupe_key")
);
--> statement-breakpoint
ALTER TABLE "review_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "review_items" ADD CONSTRAINT "review_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_items" ADD CONSTRAINT "review_items_candidate_application_id_applications_id_fk" FOREIGN KEY ("candidate_application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_items" ADD CONSTRAINT "review_items_application_fk" FOREIGN KEY ("application_id","user_id") REFERENCES "public"."applications"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "review_items_user_state_created_idx" ON "review_items" USING btree ("user_id","state","created_at" DESC NULLS LAST);
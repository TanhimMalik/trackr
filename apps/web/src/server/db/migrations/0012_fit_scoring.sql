CREATE TABLE "resume_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"profile" jsonb NOT NULL,
	"preferences" jsonb NOT NULL,
	"source_filename" text,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "resume_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "fit_score" integer;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "fit" jsonb;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "fit_scored_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "resume_profiles" ADD CONSTRAINT "resume_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
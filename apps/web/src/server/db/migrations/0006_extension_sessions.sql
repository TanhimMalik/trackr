CREATE TABLE "extension_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text NOT NULL,
	"code_hash" text,
	"code_expires_at" timestamp with time zone,
	"access_token_hash" text,
	"access_expires_at" timestamp with time zone,
	"refresh_token_hash" text,
	"refresh_expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "extension_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "rate_limit_buckets" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limit_buckets_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
ALTER TABLE "rate_limit_buckets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "extension_sessions" ADD CONSTRAINT "extension_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "extension_sessions_code_unique" ON "extension_sessions" USING btree ("code_hash") WHERE "extension_sessions"."code_hash" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "extension_sessions_access_unique" ON "extension_sessions" USING btree ("access_token_hash") WHERE "extension_sessions"."access_token_hash" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "extension_sessions_refresh_unique" ON "extension_sessions" USING btree ("refresh_token_hash") WHERE "extension_sessions"."refresh_token_hash" is not null;--> statement-breakpoint
CREATE INDEX "extension_sessions_user_idx" ON "extension_sessions" USING btree ("user_id");
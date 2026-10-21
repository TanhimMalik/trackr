CREATE TABLE "fit_cache" (
	"user_id" uuid NOT NULL,
	"posting_hash" text NOT NULL,
	"fit" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fit_cache_user_id_posting_hash_pk" PRIMARY KEY("user_id","posting_hash")
);
--> statement-breakpoint
ALTER TABLE "fit_cache" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "fit_cache" ADD CONSTRAINT "fit_cache_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
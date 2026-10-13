CREATE TABLE "blacklist"."staff_credential_change_intents" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"security_version" integer NOT NULL,
	"password_hash" text NOT NULL,
	"expires_at" timestamp with time zone DEFAULT now() NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "blacklist"."staff_credential_change_intents" ADD CONSTRAINT "staff_credential_change_intents_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "blacklist"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."staff_credential_change_intents" ADD CONSTRAINT "staff_credential_change_intents_session_id_auth_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "blacklist"."auth_sessions"("id") ON DELETE cascade ON UPDATE no action;
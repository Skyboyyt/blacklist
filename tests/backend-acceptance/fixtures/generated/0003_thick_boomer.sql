CREATE TABLE "gate"."staff_authenticators" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"credential_id" text NOT NULL,
	"public_key" text NOT NULL,
	"sign_count" integer NOT NULL,
	CONSTRAINT "staff_authenticators_credential_id_unique" UNIQUE("credential_id")
);
--> statement-breakpoint
CREATE TABLE "gate"."staff_webauthn_challenges" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"challenge_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "gate"."staff_authenticators" ADD CONSTRAINT "staff_authenticators_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "gate"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate"."staff_webauthn_challenges" ADD CONSTRAINT "staff_webauthn_challenges_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "gate"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate"."staff_webauthn_challenges" ADD CONSTRAINT "staff_webauthn_challenges_token_id_identity_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "gate"."identity_tokens"("id") ON DELETE no action ON UPDATE no action;
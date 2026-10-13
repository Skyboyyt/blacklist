CREATE SCHEMA "gate";
--> statement-breakpoint
CREATE TABLE "gate"."auth_accounts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credential_identity" UNIQUE("provider_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "gate"."addresses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" text DEFAULT 'address' NOT NULL,
	CONSTRAINT "address_kind" CHECK ("gate"."addresses"."kind" = 'address')
);
--> statement-breakpoint
CREATE TABLE "gate"."risk_assessments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"subject_id" uuid NOT NULL,
	CONSTRAINT "assessment_subject_pair" UNIQUE("subject_id","id")
);
--> statement-breakpoint
CREATE TABLE "gate"."audit_log" (
	"seq" bigint PRIMARY KEY NOT NULL,
	"id" uuid DEFAULT uuidv7() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"action" text NOT NULL,
	"target_id" uuid NOT NULL,
	"details" jsonb NOT NULL,
	"prev_hash" text NOT NULL,
	"row_hash" text NOT NULL,
	CONSTRAINT "audit_log_id_unique" UNIQUE("id")
);
--> statement-breakpoint
CREATE TABLE "gate"."current_risk_assessments" (
	"subject_id" uuid PRIMARY KEY NOT NULL,
	"assessment_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gate"."security_email_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"entity_id" uuid NOT NULL,
	"generation" integer NOT NULL,
	"outcome" text NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gate"."registration_intents" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"email" text NOT NULL,
	"state" text NOT NULL,
	"token_hash" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registration_intents_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "gate"."session_policy_state" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"account_kind" text NOT NULL,
	"security_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gate"."account_security_state" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"security_version" integer DEFAULT 1 NOT NULL,
	"last_reset_generation" integer DEFAULT 0 NOT NULL,
	"sensitive_actions_locked_until" timestamp with time zone,
	"password_changed_at" timestamp with time zone,
	CONSTRAINT "security_version_positive" CHECK ("gate"."account_security_state"."security_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "gate"."auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_sessions_token_unique" UNIQUE("token"),
	CONSTRAINT "session_owner" UNIQUE("id","user_id")
);
--> statement-breakpoint
CREATE TABLE "gate"."subjects" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"kind" text NOT NULL,
	CONSTRAINT "subject_kind_pair" UNIQUE("id","kind")
);
--> statement-breakpoint
CREATE TABLE "gate"."identity_tokens" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"state" text NOT NULL,
	"token_hash" text NOT NULL,
	"generation" integer NOT NULL,
	"security_version" integer NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "identity_tokens_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "token_purpose_valid" CHECK ("gate"."identity_tokens"."purpose" in ('password_reset','email_change')),
	CONSTRAINT "token_state_valid" CHECK ("gate"."identity_tokens"."state" in ('pending_delivery','active','consumed','invalidated','expired'))
);
--> statement-breakpoint
CREATE TABLE "gate"."auth_users" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean NOT NULL,
	"image" text,
	"account_kind" text DEFAULT 'member' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_users_email_unique" UNIQUE("email"),
	CONSTRAINT "account_kind_valid" CHECK ("gate"."auth_users"."account_kind" in ('member', 'staff')),
	CONSTRAINT "account_status_valid" CHECK ("gate"."auth_users"."status" in ('active', 'suspended', 'deactivated')),
	CONSTRAINT "email_verified_at_creation" CHECK ("gate"."auth_users"."email_verified")
);
--> statement-breakpoint
CREATE TABLE "gate"."auth_verifications" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gate"."auth_accounts" ADD CONSTRAINT "auth_accounts_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "gate"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate"."addresses" ADD CONSTRAINT "addresses_id_kind_subjects_id_kind_fk" FOREIGN KEY ("id","kind") REFERENCES "gate"."subjects"("id","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate"."risk_assessments" ADD CONSTRAINT "risk_assessments_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "gate"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate"."current_risk_assessments" ADD CONSTRAINT "current_risk_assessments_subject_id_assessment_id_risk_assessments_subject_id_id_fk" FOREIGN KEY ("subject_id","assessment_id") REFERENCES "gate"."risk_assessments"("subject_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate"."session_policy_state" ADD CONSTRAINT "policy_owner" FOREIGN KEY ("session_id","user_id") REFERENCES "gate"."auth_sessions"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate"."account_security_state" ADD CONSTRAINT "account_security_state_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "gate"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate"."auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "gate"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate"."identity_tokens" ADD CONSTRAINT "identity_tokens_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "gate"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_open_registration" ON "gate"."registration_intents" USING btree ("email") WHERE "gate"."registration_intents"."state" in ('requested','pending_delivery','issued');--> statement-breakpoint
CREATE UNIQUE INDEX "one_open_identity_token" ON "gate"."identity_tokens" USING btree ("user_id","purpose") WHERE "gate"."identity_tokens"."state" in ('pending_delivery','active');
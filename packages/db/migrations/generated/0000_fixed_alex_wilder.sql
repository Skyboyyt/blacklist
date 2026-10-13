CREATE SCHEMA "blacklist";
--> statement-breakpoint
CREATE TABLE "blacklist"."auth_accounts" (
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
CREATE TABLE "blacklist"."auth_sessions" (
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
CREATE TABLE "blacklist"."auth_users" (
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
	CONSTRAINT "account_kind_valid" CHECK ("blacklist"."auth_users"."account_kind" in ('member', 'staff')),
	CONSTRAINT "account_status_valid" CHECK ("blacklist"."auth_users"."status" in ('active', 'suspended', 'deactivated')),
	CONSTRAINT "email_verified_at_creation" CHECK ("blacklist"."auth_users"."email_verified")
);
--> statement-breakpoint
CREATE TABLE "blacklist"."auth_verifications" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blacklist"."security_email_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"kind" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"generation" integer NOT NULL,
	"outcome" text NOT NULL,
	"provider_message_id" text,
	"sanitized_error_code" text,
	"provider_status" integer,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_outcome_valid" CHECK ("blacklist"."security_email_deliveries"."outcome" in ('accepted_for_delivery','retryable_failure','permanent_failure'))
);
--> statement-breakpoint
CREATE TABLE "blacklist"."email_change_requests" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"new_email" text NOT NULL,
	"security_version" integer NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"requested_ip_prefix" text,
	"processed_at" timestamp with time zone,
	"outcome" text
);
--> statement-breakpoint
CREATE TABLE "blacklist"."registration_intents" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"email" text NOT NULL,
	"state" text NOT NULL,
	"generation" integer DEFAULT 0 NOT NULL,
	"delivery_outcome" text,
	"close_reason" text,
	"token_hash" text,
	"issued_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"superseded_at" timestamp with time zone,
	"requested_ip_prefix" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registration_intents_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "registration_state_valid" CHECK ("blacklist"."registration_intents"."state" in ('requested','pending_delivery','issued','completed','superseded','expired'))
);
--> statement-breakpoint
CREATE TABLE "blacklist"."session_policy_state" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"account_kind" text NOT NULL,
	"security_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reauthenticated_at" timestamp with time zone,
	"ip_prefix" text,
	"user_agent_summary" text
);
--> statement-breakpoint
CREATE TABLE "blacklist"."user_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"handle" text NOT NULL,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_profiles_handle_unique" UNIQUE("handle"),
	CONSTRAINT "handle_valid" CHECK ("blacklist"."user_profiles"."handle" ~ '^[a-z0-9_]{3,30}$')
);
--> statement-breakpoint
CREATE TABLE "blacklist"."password_reset_requests" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"email" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"requested_ip_prefix" text,
	"processed_at" timestamp with time zone,
	"outcome" text
);
--> statement-breakpoint
CREATE TABLE "blacklist"."account_security_state" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"security_version" integer DEFAULT 1 NOT NULL,
	"last_reset_generation" integer DEFAULT 0 NOT NULL,
	"sensitive_actions_locked_until" timestamp with time zone,
	"password_changed_at" timestamp with time zone,
	"deactivated_at" timestamp with time zone,
	"staff_recovery_pending" boolean DEFAULT false NOT NULL,
	"staff_authenticator_deficit_since" timestamp with time zone,
	CONSTRAINT "security_version_positive" CHECK ("blacklist"."account_security_state"."security_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "blacklist"."auth_throttle" (
	"key" text PRIMARY KEY NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"next_allowed_at" timestamp with time zone,
	"challenge_required" boolean DEFAULT false NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blacklist"."identity_tokens" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"target_email" text,
	"request_id" uuid NOT NULL,
	"generation" integer NOT NULL,
	"security_version" integer NOT NULL,
	"state" text NOT NULL,
	"invalidation_reason" text,
	"token_hash" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone DEFAULT now() NOT NULL,
	"activated_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "identity_tokens_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "token_purpose_valid" CHECK ("blacklist"."identity_tokens"."purpose" in ('password_reset','email_change')),
	CONSTRAINT "token_state_valid" CHECK ("blacklist"."identity_tokens"."state" in ('pending_delivery','active','consumed','invalidated','expired'))
);
--> statement-breakpoint
CREATE TABLE "blacklist"."staff_session_assurance" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"authenticator_id" uuid NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blacklist"."staff_authenticators" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"credential_id" text NOT NULL,
	"public_key" text NOT NULL,
	"sign_count" integer NOT NULL,
	"transports" jsonb NOT NULL,
	"aaguid" text NOT NULL,
	"backup_eligible" boolean NOT NULL,
	"backup_state" boolean NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoke_reason" text,
	"flagged_at" timestamp with time zone,
	CONSTRAINT "staff_authenticators_credential_id_unique" UNIQUE("credential_id"),
	CONSTRAINT "authenticator_owner" UNIQUE("id","user_id"),
	CONSTRAINT "sign_count_nonnegative" CHECK ("blacklist"."staff_authenticators"."sign_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "blacklist"."staff_webauthn_challenges" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid,
	"invitation_id" uuid,
	"flow_id" uuid,
	"session_id" uuid,
	"token_id" uuid,
	"purpose" text NOT NULL,
	"action_hash" text,
	"challenge_hash" text NOT NULL,
	"expires_at" timestamp with time zone DEFAULT now() NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "challenge_purpose_valid" CHECK ("blacklist"."staff_webauthn_challenges"."purpose" in ('enroll','login','stepup','reset')),
	CONSTRAINT "challenge_binding_valid" CHECK (("blacklist"."staff_webauthn_challenges"."purpose" = 'enroll' and "blacklist"."staff_webauthn_challenges"."flow_id" is not null and "blacklist"."staff_webauthn_challenges"."invitation_id" is not null and "blacklist"."staff_webauthn_challenges"."user_id" is null) or ("blacklist"."staff_webauthn_challenges"."purpose" <> 'enroll' and "blacklist"."staff_webauthn_challenges"."user_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "blacklist"."staff_enrollment_flows" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"invitation_id" uuid NOT NULL,
	"flow_hash" text NOT NULL,
	"invitation_generation" integer NOT NULL,
	"password_hash" text,
	"authenticators" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expires_at" timestamp with time zone DEFAULT now() NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_enrollment_flows_flow_hash_unique" UNIQUE("flow_hash")
);
--> statement-breakpoint
CREATE TABLE "blacklist"."staff_invitations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"basis" text NOT NULL,
	"invited_by_actor" text NOT NULL,
	"requires_second_approval" boolean NOT NULL,
	"approved_by_actor" text,
	"approved_at" timestamp with time zone,
	"state" text NOT NULL,
	"token_hash" text,
	"enrollment_code_hash" text NOT NULL,
	"enrollment_code_attempts" integer DEFAULT 0 NOT NULL,
	"generation" integer DEFAULT 0 NOT NULL,
	"delivered_at" timestamp with time zone,
	"issued_at" timestamp with time zone,
	"expires_at" timestamp with time zone DEFAULT now() NOT NULL,
	"target_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_invitations_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "invitation_role_valid" CHECK ("blacklist"."staff_invitations"."role" in ('moderator','admin','appeal_reviewer')),
	CONSTRAINT "invitation_code_attempts_valid" CHECK ("blacklist"."staff_invitations"."enrollment_code_attempts" between 0 and 5),
	CONSTRAINT "invitation_approver_distinct" CHECK ("blacklist"."staff_invitations"."approved_by_actor" is null or "blacklist"."staff_invitations"."approved_by_actor" <> "blacklist"."staff_invitations"."invited_by_actor"),
	CONSTRAINT "invitation_state_valid" CHECK ("blacklist"."staff_invitations"."state" in ('pending_approval','issued','accepted','revoked','expired'))
);
--> statement-breakpoint
CREATE TABLE "blacklist"."staff_recovery_cases" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"subject_user_id" uuid NOT NULL,
	"opened_by" text NOT NULL,
	"approved_by" text,
	"objection_window_ends_at" timestamp with time zone,
	"state" text NOT NULL,
	"invitation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recovery_approver_distinct" CHECK ("blacklist"."staff_recovery_cases"."approved_by" is null or "blacklist"."staff_recovery_cases"."approved_by" <> "blacklist"."staff_recovery_cases"."opened_by")
);
--> statement-breakpoint
CREATE TABLE "blacklist"."staff_recovery_verifications" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"case_id" uuid NOT NULL,
	"verifier" text NOT NULL,
	"was_admin" boolean NOT NULL,
	"method" text NOT NULL,
	"rationale" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "one_verification_per_actor" UNIQUE("case_id","verifier")
);
--> statement-breakpoint
CREATE TABLE "blacklist"."staff_role_requests" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"target_user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"action" text NOT NULL,
	"proposed_by" text NOT NULL,
	"approved_by" text,
	"approval_basis" text,
	"state" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone,
	CONSTRAINT "role_request_distinct" CHECK ("blacklist"."staff_role_requests"."approved_by" is null or "blacklist"."staff_role_requests"."proposed_by" <> "blacklist"."staff_role_requests"."approved_by"),
	CONSTRAINT "role_request_role_valid" CHECK ("blacklist"."staff_role_requests"."role" in ('moderator','admin','appeal_reviewer')),
	CONSTRAINT "role_request_action_valid" CHECK ("blacklist"."staff_role_requests"."action" in ('grant','revoke'))
);
--> statement-breakpoint
CREATE TABLE "blacklist"."user_role_assignments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"granted_via" text NOT NULL,
	"source_id" uuid NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoke_reason" text,
	CONSTRAINT "staff_role_valid" CHECK ("blacklist"."user_role_assignments"."role" in ('moderator','admin','appeal_reviewer'))
);
--> statement-breakpoint
CREATE TABLE "blacklist"."system_state" (
	"key" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"staff_bootstrap_completed_at" timestamp with time zone,
	CONSTRAINT "singleton_system_state" CHECK ("blacklist"."system_state"."key" = 1)
);
--> statement-breakpoint
CREATE TABLE "blacklist"."actor_identity_map" (
	"actor_ref" text PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"erased_at" timestamp with time zone,
	CONSTRAINT "actor_identity_map_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "blacklist"."audit_log" (
	"seq" bigint PRIMARY KEY NOT NULL,
	"id" uuid DEFAULT uuidv7() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_type" text NOT NULL,
	"actor_ref" text NOT NULL,
	"actor_session_ref" text,
	"actor_label" text,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"request_id" text,
	"ip_prefix" text,
	"details" jsonb NOT NULL,
	"prev_hash" text NOT NULL,
	"row_hash" text NOT NULL,
	CONSTRAINT "audit_log_id_unique" UNIQUE("id")
);
--> statement-breakpoint
CREATE TABLE "blacklist"."security_events" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid,
	"event_type" text NOT NULL,
	"ip_prefix" text,
	"user_agent_summary" text,
	"details" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "blacklist"."auth_accounts" ADD CONSTRAINT "auth_accounts_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "blacklist"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "blacklist"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."email_change_requests" ADD CONSTRAINT "email_change_requests_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "blacklist"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."session_policy_state" ADD CONSTRAINT "policy_owner" FOREIGN KEY ("session_id","user_id") REFERENCES "blacklist"."auth_sessions"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."user_profiles" ADD CONSTRAINT "user_profiles_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "blacklist"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."account_security_state" ADD CONSTRAINT "account_security_state_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "blacklist"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."identity_tokens" ADD CONSTRAINT "identity_tokens_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "blacklist"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."staff_session_assurance" ADD CONSTRAINT "staff_session_assurance_session_id_user_id_auth_sessions_id_user_id_fk" FOREIGN KEY ("session_id","user_id") REFERENCES "blacklist"."auth_sessions"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."staff_session_assurance" ADD CONSTRAINT "staff_session_assurance_authenticator_id_user_id_staff_authenticators_id_user_id_fk" FOREIGN KEY ("authenticator_id","user_id") REFERENCES "blacklist"."staff_authenticators"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."staff_authenticators" ADD CONSTRAINT "staff_authenticators_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "blacklist"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."staff_webauthn_challenges" ADD CONSTRAINT "staff_webauthn_challenges_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "blacklist"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."staff_webauthn_challenges" ADD CONSTRAINT "staff_webauthn_challenges_invitation_id_staff_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "blacklist"."staff_invitations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."staff_webauthn_challenges" ADD CONSTRAINT "staff_webauthn_challenges_flow_id_staff_enrollment_flows_id_fk" FOREIGN KEY ("flow_id") REFERENCES "blacklist"."staff_enrollment_flows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."staff_webauthn_challenges" ADD CONSTRAINT "staff_webauthn_challenges_session_id_auth_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "blacklist"."auth_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."staff_enrollment_flows" ADD CONSTRAINT "staff_enrollment_flows_invitation_id_staff_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "blacklist"."staff_invitations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."staff_invitations" ADD CONSTRAINT "staff_invitations_target_user_id_auth_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "blacklist"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."staff_recovery_cases" ADD CONSTRAINT "staff_recovery_cases_subject_user_id_auth_users_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "blacklist"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."staff_recovery_cases" ADD CONSTRAINT "staff_recovery_cases_invitation_id_staff_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "blacklist"."staff_invitations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."staff_recovery_verifications" ADD CONSTRAINT "staff_recovery_verifications_case_id_staff_recovery_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "blacklist"."staff_recovery_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."staff_role_requests" ADD CONSTRAINT "staff_role_requests_target_user_id_auth_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "blacklist"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."user_role_assignments" ADD CONSTRAINT "user_role_assignments_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "blacklist"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."actor_identity_map" ADD CONSTRAINT "actor_identity_map_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "blacklist"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."security_events" ADD CONSTRAINT "security_events_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "blacklist"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_open_registration" ON "blacklist"."registration_intents" USING btree ("email") WHERE "blacklist"."registration_intents"."state" in ('requested','pending_delivery','issued');--> statement-breakpoint
CREATE UNIQUE INDEX "one_open_identity_token" ON "blacklist"."identity_tokens" USING btree ("user_id","purpose") WHERE "blacklist"."identity_tokens"."state" in ('pending_delivery','active');--> statement-breakpoint
CREATE UNIQUE INDEX "one_open_recovery" ON "blacklist"."staff_recovery_cases" USING btree ("subject_user_id") WHERE "blacklist"."staff_recovery_cases"."state" not in ('completed','cancelled');--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_staff_role" ON "blacklist"."user_role_assignments" USING btree ("user_id","role") WHERE "blacklist"."user_role_assignments"."revoked_at" is null;
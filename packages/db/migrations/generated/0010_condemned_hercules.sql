CREATE TABLE "blacklist"."risk_signal_suppressions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"subject_id" uuid NOT NULL,
	"factor_code" text NOT NULL,
	"public_reason" text NOT NULL,
	"internal_rationale" text NOT NULL,
	"stepup_challenge_id" uuid NOT NULL,
	"created_by_ref" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lifted_at" timestamp with time zone,
	"lifted_by_ref" text,
	"lift_reason" text,
	"lift_stepup_challenge_id" uuid,
	CONSTRAINT "suppression_factor_valid" CHECK ("blacklist"."risk_signal_suppressions"."factor_code" in ('token.symbol_impersonation','eoa.delegated_to_flagged')),
	CONSTRAINT "suppression_public_reason" CHECK (char_length("blacklist"."risk_signal_suppressions"."public_reason") between 10 and 300),
	CONSTRAINT "suppression_rationale" CHECK (char_length("blacklist"."risk_signal_suppressions"."internal_rationale") between 10 and 2000),
	CONSTRAINT "suppression_lift_complete" CHECK (num_nulls("blacklist"."risk_signal_suppressions"."lifted_at", "blacklist"."risk_signal_suppressions"."lifted_by_ref", "blacklist"."risk_signal_suppressions"."lift_reason", "blacklist"."risk_signal_suppressions"."lift_stepup_challenge_id") in (0, 4))
);
--> statement-breakpoint
CREATE TABLE "blacklist"."address_labels" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"subject_id" uuid NOT NULL,
	"text" text NOT NULL,
	"provenance" text NOT NULL,
	"source_name" text,
	"basis_note" text NOT NULL,
	"created_by_ref" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone,
	"retired_by_ref" text,
	"retire_reason" text,
	CONSTRAINT "label_provenance_valid" CHECK ("blacklist"."address_labels"."provenance" in ('moderator_finding','external_source')),
	CONSTRAINT "label_source_name" CHECK (("blacklist"."address_labels"."provenance" = 'external_source') = ("blacklist"."address_labels"."source_name" is not null) and char_length(coalesce("blacklist"."address_labels"."source_name", 'x')) between 1 and 80),
	CONSTRAINT "label_text_length" CHECK (char_length("blacklist"."address_labels"."text") between 3 and 60),
	CONSTRAINT "label_basis_length" CHECK (char_length("blacklist"."address_labels"."basis_note") between 10 and 300),
	CONSTRAINT "label_retirement" CHECK (("blacklist"."address_labels"."retired_at" is null) = ("blacklist"."address_labels"."retired_by_ref" is null) and ("blacklist"."address_labels"."retired_at" is null) = ("blacklist"."address_labels"."retire_reason" is null))
);
--> statement-breakpoint
CREATE TABLE "blacklist"."notifications" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"source_ref" text NOT NULL,
	"source_revision" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "one_notification_per_event" UNIQUE("recipient_user_id","dedupe_key"),
	CONSTRAINT "notification_type_valid" CHECK ("blacklist"."notifications"."type" in ('submission_received','information_requested','decision_recorded','standing_decided','appeal_escalated'))
);
--> statement-breakpoint
ALTER TABLE "blacklist"."risk_signal_suppressions" ADD CONSTRAINT "risk_signal_suppressions_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "blacklist"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."address_labels" ADD CONSTRAINT "address_labels_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "blacklist"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."notifications" ADD CONSTRAINT "notifications_recipient_user_id_auth_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "blacklist"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_suppression" ON "blacklist"."risk_signal_suppressions" USING btree ("subject_id","factor_code") WHERE "blacklist"."risk_signal_suppressions"."lifted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_label_text" ON "blacklist"."address_labels" USING btree ("subject_id",lower("text")) WHERE "blacklist"."address_labels"."retired_at" is null;--> statement-breakpoint
CREATE INDEX "notifications_by_recipient" ON "blacklist"."notifications" USING btree ("recipient_user_id","created_at");
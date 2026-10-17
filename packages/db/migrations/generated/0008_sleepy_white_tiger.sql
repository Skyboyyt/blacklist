CREATE TABLE "blacklist"."assessment_annotations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"subject_id" uuid NOT NULL,
	"assessment_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"note" text,
	"decision_id" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "annotation_kind_valid" CHECK ("blacklist"."assessment_annotations"."kind" in ('superseded_by_reversal','finding_suspended','stale'))
);
--> statement-breakpoint
CREATE TABLE "blacklist"."current_risk_assessments" (
	"subject_id" uuid PRIMARY KEY NOT NULL,
	"assessment_id" uuid NOT NULL,
	"seq" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blacklist"."risk_assessment_factors" (
	"assessment_id" uuid NOT NULL,
	"signal_id" uuid NOT NULL,
	"contribution" integer NOT NULL,
	"applied" boolean NOT NULL,
	"reason" text,
	"explanation_key" text NOT NULL,
	CONSTRAINT "risk_assessment_factors_assessment_id_signal_id_pk" PRIMARY KEY("assessment_id","signal_id"),
	CONSTRAINT "factor_contribution_range" CHECK ("blacklist"."risk_assessment_factors"."contribution" between 0 and 100),
	CONSTRAINT "factor_applied_reason" CHECK ("blacklist"."risk_assessment_factors"."applied" = ("blacklist"."risk_assessment_factors"."reason" is null))
);
--> statement-breakpoint
CREATE TABLE "blacklist"."risk_assessment_inputs" (
	"assessment_id" uuid NOT NULL,
	"signal_id" uuid NOT NULL,
	"signal_revision" integer NOT NULL,
	"factor_code" text NOT NULL,
	"tier" text NOT NULL,
	"provenance" text NOT NULL,
	"status_at_evaluation" text NOT NULL,
	"source_revision" text NOT NULL,
	"valid_until" timestamp with time zone,
	"independently_approved" boolean NOT NULL,
	"evidence_refs" jsonb NOT NULL,
	CONSTRAINT "risk_assessment_inputs_assessment_id_signal_id_pk" PRIMARY KEY("assessment_id","signal_id")
);
--> statement-breakpoint
CREATE TABLE "blacklist"."risk_assessments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"subject_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"score" integer,
	"band" text NOT NULL,
	"confidence" text NOT NULL,
	"ceiling" integer NOT NULL,
	"ceiling_applied" boolean NOT NULL,
	"ceiling_reason" text,
	"ruleset_version" text NOT NULL,
	"ruleset_checksum" text NOT NULL,
	"engine_version" text NOT NULL,
	"evaluation_time" timestamp with time zone NOT NULL,
	"effective_inputs_hash" text NOT NULL,
	"coverage" jsonb NOT NULL,
	"next_review_at" timestamp with time zone,
	"trigger" text NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assessment_subject_seq" UNIQUE("subject_id","seq"),
	CONSTRAINT "assessment_subject_id" UNIQUE("subject_id","id"),
	CONSTRAINT "assessment_score_range" CHECK ("blacklist"."risk_assessments"."score" is null or "blacklist"."risk_assessments"."score" between 0 and 100),
	CONSTRAINT "assessment_band_valid" CHECK ("blacklist"."risk_assessments"."band" in ('low','moderate','high','severe','not_assessed')),
	CONSTRAINT "assessment_score_band" CHECK (("blacklist"."risk_assessments"."score" is null) = ("blacklist"."risk_assessments"."band" = 'not_assessed')),
	CONSTRAINT "assessment_confidence_valid" CHECK ("blacklist"."risk_assessments"."confidence" in ('low','medium','high')),
	CONSTRAINT "assessment_trigger_valid" CHECK ("blacklist"."risk_assessments"."trigger" in ('signal_change','expiry','ruleset','manual_replay'))
);
--> statement-breakpoint
CREATE TABLE "blacklist"."risk_rulesets" (
	"version" text PRIMARY KEY NOT NULL,
	"engine_version" text NOT NULL,
	"definition" jsonb NOT NULL,
	"checksum" text NOT NULL,
	"activated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone,
	CONSTRAINT "ruleset_checksum_hex" CHECK ("blacklist"."risk_rulesets"."checksum" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "blacklist"."risk_signal_revisions" (
	"signal_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"status" text NOT NULL,
	"source_revision" text NOT NULL,
	"valid_until" timestamp with time zone,
	"independently_approved" boolean NOT NULL,
	"evidence_refs" jsonb NOT NULL,
	"reason" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "risk_signal_revisions_signal_id_revision_pk" PRIMARY KEY("signal_id","revision"),
	CONSTRAINT "signal_revision_status_valid" CHECK ("blacklist"."risk_signal_revisions"."status" in ('active','expired','retracted','suppressed','suspended','superseded'))
);
--> statement-breakpoint
CREATE TABLE "blacklist"."risk_signals" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"subject_id" uuid NOT NULL,
	"factor_code" text NOT NULL,
	"tier" text NOT NULL,
	"provenance" text NOT NULL,
	"source_type" text NOT NULL,
	"source_ref" text NOT NULL,
	"current_revision" integer NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "one_signal_per_source_factor" UNIQUE("source_type","source_ref","factor_code"),
	CONSTRAINT "signal_tier_valid" CHECK ("blacklist"."risk_signals"."tier" in ('verified','analysis','disclosure','weak')),
	CONSTRAINT "signal_status_valid" CHECK ("blacklist"."risk_signals"."status" in ('active','expired','retracted','suppressed','suspended','superseded')),
	CONSTRAINT "signal_source_type_valid" CHECK ("blacklist"."risk_signals"."source_type" in ('finding','chain_analysis'))
);
--> statement-breakpoint
CREATE TABLE "blacklist"."risk_subject_state" (
	"subject_id" uuid PRIMARY KEY NOT NULL,
	"last_seq" integer DEFAULT 0 NOT NULL,
	"dirty" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "blacklist"."assessment_annotations" ADD CONSTRAINT "assessment_annotations_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "blacklist"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."assessment_annotations" ADD CONSTRAINT "assessment_annotations_assessment_id_risk_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "blacklist"."risk_assessments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."current_risk_assessments" ADD CONSTRAINT "current_risk_assessments_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "blacklist"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."current_risk_assessments" ADD CONSTRAINT "current_assessment_same_subject" FOREIGN KEY ("subject_id","assessment_id") REFERENCES "blacklist"."risk_assessments"("subject_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."risk_assessment_factors" ADD CONSTRAINT "risk_assessment_factors_assessment_id_risk_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "blacklist"."risk_assessments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."risk_assessment_factors" ADD CONSTRAINT "risk_assessment_factors_signal_id_risk_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "blacklist"."risk_signals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."risk_assessment_inputs" ADD CONSTRAINT "risk_assessment_inputs_assessment_id_risk_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "blacklist"."risk_assessments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."risk_assessment_inputs" ADD CONSTRAINT "risk_assessment_inputs_signal_id_risk_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "blacklist"."risk_signals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."risk_assessments" ADD CONSTRAINT "risk_assessments_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "blacklist"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."risk_assessments" ADD CONSTRAINT "risk_assessments_ruleset_version_risk_rulesets_version_fk" FOREIGN KEY ("ruleset_version") REFERENCES "blacklist"."risk_rulesets"("version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."risk_signal_revisions" ADD CONSTRAINT "risk_signal_revisions_signal_id_risk_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "blacklist"."risk_signals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."risk_signals" ADD CONSTRAINT "risk_signals_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "blacklist"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."risk_subject_state" ADD CONSTRAINT "risk_subject_state_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "blacklist"."subjects"("id") ON DELETE no action ON UPDATE no action;
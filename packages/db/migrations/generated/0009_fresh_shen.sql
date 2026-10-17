CREATE TABLE "blacklist"."correction_requests" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"requester_user_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"base_revision" integer NOT NULL,
	"statement" text NOT NULL,
	"proposed_description" text,
	"add_domain" text,
	"retire_domain" text,
	"status" text NOT NULL,
	"submitter_reason" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "correction_status_valid" CHECK ("blacklist"."correction_requests"."status" in ('submitted','in_review','accepted','rejected','withdrawn')),
	CONSTRAINT "correction_reason_valid" CHECK ("blacklist"."correction_requests"."submitter_reason" is null or "blacklist"."correction_requests"."submitter_reason" in ('insufficient_evidence','out_of_scope','duplicate','not_reproducible','already_corrected')),
	CONSTRAINT "correction_has_change" CHECK (num_nonnulls("blacklist"."correction_requests"."proposed_description", "blacklist"."correction_requests"."add_domain", "blacklist"."correction_requests"."retire_domain") >= 1),
	CONSTRAINT "correction_statement_length" CHECK (char_length("blacklist"."correction_requests"."statement") between 10 and 5000)
);
--> statement-breakpoint
CREATE TABLE "blacklist"."project_addresses" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"project_id" uuid NOT NULL,
	"address_subject_id" uuid NOT NULL,
	"role" text NOT NULL,
	"basis" text NOT NULL,
	"basis_note" text NOT NULL,
	"attributed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone,
	CONSTRAINT "project_address_role" CHECK ("blacklist"."project_addresses"."role" in ('token','contract','program','treasury','deployer','other')),
	CONSTRAINT "project_address_basis" CHECK ("blacklist"."project_addresses"."basis" in ('official_announcement','deployment_record','authority_signature','staff_documentary_review')),
	CONSTRAINT "project_address_note" CHECK (char_length("blacklist"."project_addresses"."basis_note") between 1 and 300)
);
--> statement-breakpoint
CREATE TABLE "blacklist"."project_domains" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"project_id" uuid NOT NULL,
	"hostname" text NOT NULL,
	"basis" text NOT NULL,
	"basis_note" text NOT NULL,
	"attributed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone,
	CONSTRAINT "project_domain_hostname" CHECK ("blacklist"."project_domains"."hostname" ~ '^([a-z0-9-]+\.)+[a-z0-9-]+$' and char_length("blacklist"."project_domains"."hostname") <= 253),
	CONSTRAINT "project_domain_basis" CHECK ("blacklist"."project_domains"."basis" in ('official_announcement','deployment_record','authority_signature','staff_documentary_review')),
	CONSTRAINT "project_domain_note" CHECK (char_length("blacklist"."project_domains"."basis_note") between 1 and 300)
);
--> statement-breakpoint
CREATE TABLE "blacklist"."project_revisions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"project_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"author_ref" text NOT NULL,
	"source_case_id" uuid,
	"public_note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_revision_number" UNIQUE("project_id","revision_number"),
	CONSTRAINT "project_revision_name" CHECK (char_length("blacklist"."project_revisions"."name") between 1 and 80),
	CONSTRAINT "project_revision_category" CHECK ("blacklist"."project_revisions"."category" in ('defi','exchange','wallet','token','nft','infrastructure','dao','other')),
	CONSTRAINT "project_revision_description" CHECK (char_length("blacklist"."project_revisions"."description") <= 2000)
);
--> statement-breakpoint
CREATE TABLE "blacklist"."project_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"submitter_user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"chain_id" text NOT NULL,
	"identifier" text NOT NULL,
	"links_text" jsonb NOT NULL,
	"description" text NOT NULL,
	"relationship" text NOT NULL,
	"status" text NOT NULL,
	"submitter_reason" text,
	"resulting_project_id" uuid,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "suggestion_status_valid" CHECK ("blacklist"."project_suggestions"."status" in ('submitted','needs_information','accepted_into_profile','not_accepted','withdrawn')),
	CONSTRAINT "suggestion_category_valid" CHECK ("blacklist"."project_suggestions"."category" in ('defi','exchange','wallet','token','nft','infrastructure','dao','other')),
	CONSTRAINT "suggestion_reason_valid" CHECK ("blacklist"."project_suggestions"."submitter_reason" is null or "blacklist"."project_suggestions"."submitter_reason" in ('insufficient_evidence','out_of_scope','duplicate','not_reproducible','already_corrected')),
	CONSTRAINT "suggestion_name_length" CHECK (char_length("blacklist"."project_suggestions"."name") between 2 and 80),
	CONSTRAINT "suggestion_result" CHECK (("blacklist"."project_suggestions"."status" = 'accepted_into_profile') = ("blacklist"."project_suggestions"."resulting_project_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "blacklist"."projects" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"subject_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"current_revision" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_subject_id_unique" UNIQUE("subject_id"),
	CONSTRAINT "projects_slug_unique" UNIQUE("slug"),
	CONSTRAINT "project_slug_format" CHECK ("blacklist"."projects"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length("blacklist"."projects"."slug") between 2 and 64)
);
--> statement-breakpoint
ALTER TABLE "blacklist"."moderation_cases" ADD COLUMN "suggestion_id" uuid;--> statement-breakpoint
ALTER TABLE "blacklist"."moderation_cases" ADD COLUMN "correction_id" uuid;--> statement-breakpoint
ALTER TABLE "blacklist"."correction_requests" ADD CONSTRAINT "correction_requests_requester_user_id_auth_users_id_fk" FOREIGN KEY ("requester_user_id") REFERENCES "blacklist"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."correction_requests" ADD CONSTRAINT "correction_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "blacklist"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."project_addresses" ADD CONSTRAINT "project_addresses_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "blacklist"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."project_addresses" ADD CONSTRAINT "project_addresses_address_subject_id_subjects_id_fk" FOREIGN KEY ("address_subject_id") REFERENCES "blacklist"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."project_domains" ADD CONSTRAINT "project_domains_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "blacklist"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."project_revisions" ADD CONSTRAINT "project_revisions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "blacklist"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."project_suggestions" ADD CONSTRAINT "project_suggestions_submitter_user_id_auth_users_id_fk" FOREIGN KEY ("submitter_user_id") REFERENCES "blacklist"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."project_suggestions" ADD CONSTRAINT "project_suggestions_resulting_project_id_projects_id_fk" FOREIGN KEY ("resulting_project_id") REFERENCES "blacklist"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."projects" ADD CONSTRAINT "projects_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "blacklist"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_project_address" ON "blacklist"."project_addresses" USING btree ("project_id","address_subject_id") WHERE "blacklist"."project_addresses"."retired_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_project_domain" ON "blacklist"."project_domains" USING btree ("project_id","hostname") WHERE "blacklist"."project_domains"."retired_at" is null;--> statement-breakpoint
ALTER TABLE "blacklist"."moderation_cases" ADD CONSTRAINT "moderation_cases_suggestion_id_project_suggestions_id_fk" FOREIGN KEY ("suggestion_id") REFERENCES "blacklist"."project_suggestions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."moderation_cases" ADD CONSTRAINT "moderation_cases_correction_id_correction_requests_id_fk" FOREIGN KEY ("correction_id") REFERENCES "blacklist"."correction_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_case_per_suggestion" ON "blacklist"."moderation_cases" USING btree ("suggestion_id");--> statement-breakpoint
CREATE UNIQUE INDEX "one_case_per_correction" ON "blacklist"."moderation_cases" USING btree ("correction_id");--> statement-breakpoint
ALTER TABLE "blacklist"."moderation_cases" ADD CONSTRAINT "case_suggestion_source" CHECK (("blacklist"."moderation_cases"."case_type" = 'project_suggestion') = ("blacklist"."moderation_cases"."suggestion_id" is not null));--> statement-breakpoint
ALTER TABLE "blacklist"."moderation_cases" ADD CONSTRAINT "case_correction_source" CHECK (("blacklist"."moderation_cases"."case_type" = 'correction_request') = ("blacklist"."moderation_cases"."correction_id" is not null));
CREATE TABLE "blacklist"."staff_recovery_objection_links" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"case_id" uuid NOT NULL,
	"token_hash" text,
	"state" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"used_at" timestamp with time zone,
	CONSTRAINT "staff_recovery_objection_links_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "recovery_link_state_valid" CHECK ("blacklist"."staff_recovery_objection_links"."state" in ('pending_delivery','active','objected','withdrawn','invalidated')),
	CONSTRAINT "recovery_link_hash_state" CHECK (("blacklist"."staff_recovery_objection_links"."token_hash" is null) = ("blacklist"."staff_recovery_objection_links"."state" in ('invalidated','withdrawn')))
);
--> statement-breakpoint
CREATE TABLE "blacklist"."staff_recovery_objections" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"case_id" uuid NOT NULL,
	"objector" text NOT NULL,
	"objector_kind" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"withdrawn_at" timestamp with time zone,
	CONSTRAINT "recovery_objector_kind_valid" CHECK ("blacklist"."staff_recovery_objections"."objector_kind" in ('staff','subject','operator')),
	CONSTRAINT "recovery_staff_objection_reason" CHECK ("blacklist"."staff_recovery_objections"."objector_kind" = 'subject' or char_length("blacklist"."staff_recovery_objections"."reason") between 10 and 1000)
);
--> statement-breakpoint
DROP INDEX "blacklist"."one_open_recovery";--> statement-breakpoint
ALTER TABLE "blacklist"."staff_recovery_cases" ADD COLUMN "reopens_case_id" uuid;--> statement-breakpoint
ALTER TABLE "blacklist"."staff_recovery_objection_links" ADD CONSTRAINT "staff_recovery_objection_links_case_id_staff_recovery_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "blacklist"."staff_recovery_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."staff_recovery_objections" ADD CONSTRAINT "staff_recovery_objections_case_id_staff_recovery_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "blacklist"."staff_recovery_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recovery_objections_by_objector" ON "blacklist"."staff_recovery_objections" USING btree ("objector","created_at");--> statement-breakpoint
ALTER TABLE "blacklist"."staff_recovery_cases" ADD CONSTRAINT "recovery_reopens_case_fk" FOREIGN KEY ("reopens_case_id") REFERENCES "blacklist"."staff_recovery_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_reopen_per_case" ON "blacklist"."staff_recovery_cases" USING btree ("reopens_case_id");--> statement-breakpoint
CREATE UNIQUE INDEX "one_open_recovery" ON "blacklist"."staff_recovery_cases" USING btree ("subject_user_id") WHERE "blacklist"."staff_recovery_cases"."state" not in ('completed','cancelled','objected');--> statement-breakpoint
ALTER TABLE "blacklist"."staff_recovery_cases" ADD CONSTRAINT "recovery_reopens_other" CHECK ("blacklist"."staff_recovery_cases"."reopens_case_id" is null or "blacklist"."staff_recovery_cases"."reopens_case_id" <> "blacklist"."staff_recovery_cases"."id");
CREATE TABLE "blacklist"."evidence_derivatives" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"evidence_item_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"bucket" text NOT NULL,
	"storage_key" text NOT NULL,
	"sha256" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"format" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"processor_version" text NOT NULL,
	"created_by_ref" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"purged_at" timestamp with time zone,
	CONSTRAINT "evidence_derivatives_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "evidence_derivative_kind_valid" CHECK ("blacklist"."evidence_derivatives"."kind" in ('sanitized_image','redacted')),
	CONSTRAINT "evidence_derivative_format_valid" CHECK ("blacklist"."evidence_derivatives"."format" in ('png','jpeg','webp')),
	CONSTRAINT "evidence_derivative_sha256" CHECK ("blacklist"."evidence_derivatives"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "evidence_derivative_dimensions" CHECK ("blacklist"."evidence_derivatives"."width" between 1 and 12000 and "blacklist"."evidence_derivatives"."height" between 1 and 12000 and "blacklist"."evidence_derivatives"."size_bytes" > 0)
);
--> statement-breakpoint
CREATE TABLE "blacklist"."evidence_objects" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"evidence_item_id" uuid NOT NULL,
	"role" text NOT NULL,
	"bucket" text NOT NULL,
	"storage_key" text NOT NULL,
	"object_version_id" text,
	"sha256" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"purged_at" timestamp with time zone,
	"purge_reason" text,
	CONSTRAINT "evidence_objects_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "evidence_object_role" UNIQUE("evidence_item_id","role"),
	CONSTRAINT "evidence_object_role_valid" CHECK ("blacklist"."evidence_objects"."role" in ('quarantine','original')),
	CONSTRAINT "evidence_object_sha256" CHECK ("blacklist"."evidence_objects"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "evidence_object_size" CHECK ("blacklist"."evidence_objects"."size_bytes" between 1 and 10485760),
	CONSTRAINT "evidence_object_purge" CHECK (("blacklist"."evidence_objects"."purged_at" is null) = ("blacklist"."evidence_objects"."purge_reason" is null))
);
--> statement-breakpoint
ALTER TABLE "blacklist"."evidence_items" ADD COLUMN "content_type" text;--> statement-breakpoint
ALTER TABLE "blacklist"."evidence_items" ADD COLUMN "processing_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "blacklist"."evidence_items" ADD COLUMN "next_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "blacklist"."evidence_items" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "blacklist"."evidence_derivatives" ADD CONSTRAINT "evidence_derivatives_evidence_item_id_evidence_items_id_fk" FOREIGN KEY ("evidence_item_id") REFERENCES "blacklist"."evidence_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."evidence_objects" ADD CONSTRAINT "evidence_objects_evidence_item_id_evidence_items_id_fk" FOREIGN KEY ("evidence_item_id") REFERENCES "blacklist"."evidence_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evidence_derivatives_item" ON "blacklist"."evidence_derivatives" USING btree ("evidence_item_id");--> statement-breakpoint
CREATE INDEX "evidence_items_pending" ON "blacklist"."evidence_items" USING btree ("state","next_attempt_at");--> statement-breakpoint
ALTER TABLE "blacklist"."evidence_items" ADD CONSTRAINT "evidence_image_columns" CHECK (("blacklist"."evidence_items"."kind" = 'image') = ("blacklist"."evidence_items"."content_type" is not null)
        and ("blacklist"."evidence_items"."content_type" is null or "blacklist"."evidence_items"."content_type" in ('image/png','image/jpeg','image/webp')));--> statement-breakpoint
ALTER TABLE "blacklist"."evidence_items" ADD CONSTRAINT "evidence_rejection_reason" CHECK (("blacklist"."evidence_items"."state" = 'rejected') = ("blacklist"."evidence_items"."rejection_reason" is not null) or "blacklist"."evidence_items"."kind" <> 'image');
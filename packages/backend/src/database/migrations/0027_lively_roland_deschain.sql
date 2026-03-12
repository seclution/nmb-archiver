CREATE TYPE "public"."tombstone_external_anchor_status" AS ENUM('pending', 'anchored', 'failed', 'skipped_not_configured');--> statement-breakpoint
CREATE TYPE "public"."tombstone_physical_deletion_status" AS ENUM('pending', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "deleted_email_tombstones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"archived_email_id" uuid NOT NULL,
	"ingestion_source_id" uuid NOT NULL,
	"tombstone_key" text NOT NULL,
	"deletion_mode" varchar(32) NOT NULL,
	"deletion_reason" text NOT NULL,
	"governing_rule" text,
	"actor_identifier" text NOT NULL,
	"actor_ip" text NOT NULL,
	"message_id_header" text,
	"subject" text,
	"sender_email" text NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"archived_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone NOT NULL,
	"size_bytes" bigint NOT NULL,
	"storage_hash_sha256" text NOT NULL,
	"verification_root_hash" text,
	"attachment_manifest" jsonb NOT NULL,
	"tombstone_manifest" jsonb NOT NULL,
	"tombstone_root_hash" varchar(64) NOT NULL,
	"external_anchor_status" "tombstone_external_anchor_status" DEFAULT 'pending' NOT NULL,
	"external_anchor_response" jsonb,
	"external_anchored_at" timestamp with time zone,
	"physical_deletion_status" "tombstone_physical_deletion_status" DEFAULT 'pending' NOT NULL,
	"physical_deletion_completed_at" timestamp with time zone,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deleted_email_tombstones_tombstone_key_unique" UNIQUE("tombstone_key"),
	CONSTRAINT "deleted_email_tombstones_tombstone_root_hash_unique" UNIQUE("tombstone_root_hash")
);
--> statement-breakpoint
CREATE INDEX "deleted_email_tombstones_archived_email_id_idx" ON "deleted_email_tombstones" USING btree ("archived_email_id");--> statement-breakpoint
CREATE INDEX "deleted_email_tombstones_deleted_at_idx" ON "deleted_email_tombstones" USING btree ("deleted_at");
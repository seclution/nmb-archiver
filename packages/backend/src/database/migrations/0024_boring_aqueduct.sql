CREATE TYPE "public"."nmb_revision_proof_submission_status" AS ENUM('pending', 'submitted', 'failed', 'skipped_not_configured');--> statement-breakpoint
CREATE TABLE "nmb_revision_proof_email_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"archived_email_id" uuid NOT NULL,
	"verification_root_hash" text NOT NULL,
	"submission_status" "nmb_revision_proof_submission_status" DEFAULT 'pending' NOT NULL,
	"submitted_at" timestamp with time zone,
	"last_submission_attempt_at" timestamp with time zone,
	"submission_attempts" integer DEFAULT 0 NOT NULL,
	"last_submission_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nmb_revision_proof_email_records_archived_email_id_unique" UNIQUE("archived_email_id")
);
--> statement-breakpoint
ALTER TABLE "nmb_revision_proof_email_records" ADD CONSTRAINT "nmb_revision_proof_email_records_archived_email_id_archived_emails_id_fk" FOREIGN KEY ("archived_email_id") REFERENCES "public"."archived_emails"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "nmb_revision_proof_email_records_archived_email_idx" ON "nmb_revision_proof_email_records" USING btree ("archived_email_id");--> statement-breakpoint
CREATE INDEX "nmb_revision_proof_email_records_submission_status_idx" ON "nmb_revision_proof_email_records" USING btree ("submission_status");
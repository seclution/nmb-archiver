ALTER TYPE "public"."tombstone_external_anchor_status" RENAME TO "audit_proof_submission_status";--> statement-breakpoint
ALTER TYPE "public"."audit_proof_submission_status" RENAME VALUE 'anchored' TO 'submitted';--> statement-breakpoint
ALTER TABLE "deleted_email_tombstones" RENAME COLUMN "external_anchor_status" TO "external_submission_status";--> statement-breakpoint
ALTER TABLE "deleted_email_tombstones" RENAME COLUMN "external_anchor_response" TO "external_submission_response";--> statement-breakpoint
ALTER TABLE "deleted_email_tombstones" RENAME COLUMN "external_anchored_at" TO "external_submitted_at";--> statement-breakpoint
ALTER TABLE "archived_emails" ADD COLUMN "audit_proof_submission_status" "audit_proof_submission_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "archived_emails" ADD COLUMN "audit_proof_submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "archived_emails" ADD COLUMN "audit_proof_last_submission_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "archived_emails" ADD COLUMN "audit_proof_submission_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "archived_emails" ADD COLUMN "audit_proof_last_submission_error" text;

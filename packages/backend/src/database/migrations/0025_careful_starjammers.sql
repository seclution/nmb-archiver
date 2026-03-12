CREATE TYPE "public"."audit_proof_submission_status" AS ENUM('pending', 'submitted', 'failed', 'skipped_not_configured');--> statement-breakpoint
ALTER TABLE "archived_emails" ADD COLUMN "audit_proof_submission_status" "audit_proof_submission_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "archived_emails" ADD COLUMN "audit_proof_submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "archived_emails" ADD COLUMN "audit_proof_last_submission_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "archived_emails" ADD COLUMN "audit_proof_submission_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "archived_emails" ADD COLUMN "audit_proof_last_submission_error" text;

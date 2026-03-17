import { relations } from 'drizzle-orm';
import { index, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { NmbRevisionProofSubmissionStatuses } from '@open-archiver/types';
import { archivedEmails } from './archived-emails';

export const nmbRevisionProofSubmissionStatusEnum = pgEnum(
	'nmb_revision_proof_submission_status',
	NmbRevisionProofSubmissionStatuses
);

export const nmbRevisionProofEmailRecords = pgTable(
	'nmb_revision_proof_email_records',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		archivedEmailId: uuid('archived_email_id')
			.notNull()
			.references(() => archivedEmails.id, { onDelete: 'cascade' })
			.unique(),
		verificationRootHash: text('verification_root_hash').notNull(),
		submissionStatus: nmbRevisionProofSubmissionStatusEnum('submission_status')
			.notNull()
			.default('pending'),
		submittedAt: timestamp('submitted_at', { withTimezone: true }),
		lastSubmissionAttemptAt: timestamp('last_submission_attempt_at', {
			withTimezone: true,
		}),
		submissionAttempts: integer('submission_attempts').notNull().default(0),
		lastSubmissionError: text('last_submission_error'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		index('nmb_revision_proof_email_records_archived_email_idx').on(table.archivedEmailId),
		index('nmb_revision_proof_email_records_submission_status_idx').on(table.submissionStatus),
	]
);

export const nmbRevisionProofEmailRecordsRelations = relations(
	nmbRevisionProofEmailRecords,
	({ one }) => ({
		archivedEmail: one(archivedEmails, {
			fields: [nmbRevisionProofEmailRecords.archivedEmailId],
			references: [archivedEmails.id],
		}),
	})
);

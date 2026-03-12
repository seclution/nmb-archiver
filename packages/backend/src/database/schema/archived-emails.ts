import { relations } from 'drizzle-orm';
import {
	boolean,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid,
	bigint,
	index,
	integer,
} from 'drizzle-orm/pg-core';
import { ingestionSources } from './ingestion-sources';
import { AuditProofSubmissionStatuses } from '@open-archiver/types';

export const auditProofSubmissionStatusEnum = pgEnum(
	'audit_proof_submission_status',
	AuditProofSubmissionStatuses
);

export const archivedEmails = pgTable(
	'archived_emails',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		threadId: text('thread_id'),
		ingestionSourceId: uuid('ingestion_source_id')
			.notNull()
			.references(() => ingestionSources.id, { onDelete: 'cascade' }),
		userEmail: text('user_email').notNull(),
		messageIdHeader: text('message_id_header'),
		sentAt: timestamp('sent_at', { withTimezone: true }).notNull(),
		subject: text('subject'),
		senderName: text('sender_name'),
		senderEmail: text('sender_email').notNull(),
		recipients: jsonb('recipients'),
		storagePath: text('storage_path').notNull(),
		storageHashSha256: text('storage_hash_sha256').notNull(),
		verificationRootHash: text('verification_root_hash'),
		auditProofSubmissionStatus: auditProofSubmissionStatusEnum('audit_proof_submission_status')
			.notNull()
			.default('pending'),
		auditProofSubmittedAt: timestamp('audit_proof_submitted_at', { withTimezone: true }),
		auditProofLastSubmissionAttemptAt: timestamp('audit_proof_last_submission_attempt_at', {
			withTimezone: true,
		}),
		auditProofSubmissionAttempts: integer('audit_proof_submission_attempts')
			.notNull()
			.default(0),
		auditProofLastSubmissionError: text('audit_proof_last_submission_error'),
		sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
		isIndexed: boolean('is_indexed').notNull().default(false),
		hasAttachments: boolean('has_attachments').notNull().default(false),
		isOnLegalHold: boolean('is_on_legal_hold').notNull().default(false),
		archivedAt: timestamp('archived_at', { withTimezone: true }).notNull().defaultNow(),
		path: text('path'),
		tags: jsonb('tags'),
	},
	(table) => [index('thread_id_idx').on(table.threadId)]
);

export const archivedEmailsRelations = relations(archivedEmails, ({ one }) => ({
	ingestionSource: one(ingestionSources, {
		fields: [archivedEmails.ingestionSourceId],
		references: [ingestionSources.id],
	}),
}));

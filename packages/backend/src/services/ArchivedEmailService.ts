import { count, desc, eq, asc, and } from 'drizzle-orm';
import { db } from '../database';
import {
	archivedEmails,
	attachments,
	emailAttachments,
	ingestionSources,
} from '../database/schema';
import { FilterBuilder } from './FilterBuilder';
import { AuthorizationService } from './AuthorizationService';
import type {
	PaginatedArchivedEmails,
	ArchivedEmail,
	Recipient,
	ThreadEmail,
} from '@open-archiver/types';
import { StorageService } from './StorageService';
import { SearchService } from './SearchService';
import { AuditService } from './AuditService';
import { User } from '@open-archiver/types';
import { checkDeletionEnabled } from '../helpers/deletionGuard';
import { EmailVerificationService } from './EmailVerificationService';
import { RetentionHook } from '../hooks/RetentionHook';
import { DeletedEmailTombstoneService } from './DeletedEmailTombstoneService';

const MANUAL_DELETE_REASON_REQUIRED = 'Manual delete reason is required';
const MANUAL_DELETE_REASON_TOO_SHORT = 'Manual delete reason must be at least 10 characters long';
const EXTERNAL_TOMBSTONE_SUBMISSION_FAILED = 'External tombstone submission failed';
const DELETION_BLOCKED_BY_RETENTION =
	'Deletion blocked by retention policy (Legal Hold or similar).';
const NOT_AUTHORIZED_TO_DELETE = 'Not authorized to delete archived email';
const ARCHIVED_EMAIL_NOT_FOUND = 'Archived email not found';

interface DbRecipients {
	to: { name: string; address: string }[];
	cc: { name: string; address: string }[];
	bcc: { name: string; address: string }[];
}

export class ArchivedEmailService {
	private static auditService = new AuditService();
	private static emailVerificationService = new EmailVerificationService();
	private static deletedEmailTombstoneService = new DeletedEmailTombstoneService();
	private static mapRecipients(dbRecipients: unknown): Recipient[] {
		const { to = [], cc = [], bcc = [] } = dbRecipients as DbRecipients;

		const allRecipients = [...to, ...cc, ...bcc];

		return allRecipients.map((r) => ({
			name: r.name,
			email: r.address,
		}));
	}

	public static async getArchivedEmails(
		ingestionSourceId: string,
		page: number,
		limit: number,
		userId: string
	): Promise<PaginatedArchivedEmails> {
		const offset = (page - 1) * limit;
		const { drizzleFilter } = await FilterBuilder.create(userId, 'archive', 'read');
		const where = and(eq(archivedEmails.ingestionSourceId, ingestionSourceId), drizzleFilter);

		const countQuery = db
			.select({
				count: count(archivedEmails.id),
			})
			.from(archivedEmails)
			.leftJoin(ingestionSources, eq(archivedEmails.ingestionSourceId, ingestionSources.id));

		if (where) {
			countQuery.where(where);
		}

		const [total] = await countQuery;

		const itemsQuery = db
			.select()
			.from(archivedEmails)
			.leftJoin(ingestionSources, eq(archivedEmails.ingestionSourceId, ingestionSources.id))
			.orderBy(desc(archivedEmails.sentAt))
			.limit(limit)
			.offset(offset);

		if (where) {
			itemsQuery.where(where);
		}

		const results = await itemsQuery;
		const items = results.map((r) => r.archived_emails);

		return {
			items: items.map((item) => ({
				...item,
				recipients: this.mapRecipients(item.recipients),
				tags: (item.tags as string[] | null) || null,
				path: item.path || null,
			})),
			total: total.count,
			page,
			limit,
		};
	}

	public static async getArchivedEmailById(
		emailId: string,
		userId: string,
		actor: User,
		actorIp: string,
		options?: { includeVerification?: boolean }
	): Promise<ArchivedEmail | null> {
		const email = await db.query.archivedEmails.findFirst({
			where: eq(archivedEmails.id, emailId),
			with: {
				ingestionSource: true,
			},
		});

		if (!email) {
			return null;
		}

		const authorizationService = new AuthorizationService();
		const canRead = await authorizationService.can(userId, 'read', 'archive', email);

		if (!canRead) {
			return null;
		}

		await this.auditService.createAuditLog({
			actorIdentifier: actor.id,
			actionType: 'READ',
			targetType: 'ArchivedEmail',
			targetId: emailId,
			actorIp,
			details: {},
		});

		let threadEmails: ThreadEmail[] = [];

		if (email.threadId) {
			threadEmails = await db.query.archivedEmails.findMany({
				where: and(
					eq(archivedEmails.threadId, email.threadId),
					eq(archivedEmails.ingestionSourceId, email.ingestionSourceId)
				),
				orderBy: [asc(archivedEmails.sentAt)],
				columns: {
					id: true,
					subject: true,
					sentAt: true,
					senderEmail: true,
				},
			});
		}

		const verification = options?.includeVerification
			? await this.emailVerificationService.verifyEmail(email, { includeAuditProof: true })
			: null;
		const mappedEmail = {
			...email,
			recipients: this.mapRecipients(email.recipients),
			raw: verification?.raw,
			thread: threadEmails,
			tags: (email.tags as string[] | null) || null,
			path: email.path || null,
			auditProofVerification: verification?.auditProofVerification,
			localIntegrity: verification?.localIntegrity,
			externalProof: verification?.externalProof,
			verificationRootHash:
				verification?.verificationRootHash ?? email.verificationRootHash ?? undefined,
			verification: verification
				? {
						manifest: verification.manifest,
						verificationRootHash: verification.verificationRootHash,
						localIntegrity: verification.localIntegrity,
						externalProof: verification.externalProof,
					}
				: undefined,
		};

		if (email.hasAttachments) {
			const emailAttachmentsResult = await db
				.select({
					id: attachments.id,
					filename: attachments.filename,
					mimeType: attachments.mimeType,
					sizeBytes: attachments.sizeBytes,
					storagePath: attachments.storagePath,
				})
				.from(emailAttachments)
				.innerJoin(attachments, eq(emailAttachments.attachmentId, attachments.id))
				.where(eq(emailAttachments.emailId, emailId));

			// const attachmentsWithRaw = await Promise.all(
			//     emailAttachmentsResult.map(async (attachment) => {
			//         const rawStream = await storage.get(attachment.storagePath);
			//         const raw = await streamToBuffer(rawStream as Readable);
			//         return { ...attachment, raw };
			//     })
			// );

			return {
				...mappedEmail,
				attachments: emailAttachmentsResult,
			};
		}

		return mappedEmail;
	}

	public static async deleteArchivedEmail(
		emailId: string,
		actor: User,
		actorIp: string,
		options: {
			systemDelete?: boolean;
			reason?: string;
			/**
			 * Human-readable name of the retention rule that triggered deletion
			 */
			governingRule?: string;
		} = {}
	): Promise<void> {
		checkDeletionEnabled({ allowSystemDelete: options.systemDelete });

		const canDelete = await RetentionHook.canDelete(emailId);
		if (!canDelete) {
			throw new Error(DELETION_BLOCKED_BY_RETENTION);
		}

		const deletionReason = options.reason?.trim() ?? '';
		if (!options.systemDelete && !deletionReason) {
			throw new Error(MANUAL_DELETE_REASON_REQUIRED);
		}
		if (!options.systemDelete && deletionReason.length < 10) {
			throw new Error(MANUAL_DELETE_REASON_TOO_SHORT);
		}

		const [email] = await db
			.select()
			.from(archivedEmails)
			.where(eq(archivedEmails.id, emailId));

		if (!email) {
			throw new Error(ARCHIVED_EMAIL_NOT_FOUND);
		}

		const authorizationService = new AuthorizationService();
		const canDeleteEmail = await authorizationService.can(actor.id, 'delete', 'archive', email);
		if (!canDeleteEmail) {
			throw new Error(NOT_AUTHORIZED_TO_DELETE);
		}

		const storage = new StorageService();
		const attachmentsForEmail = email.hasAttachments
			? await db
					.select({
						attachmentId: attachments.id,
						filename: attachments.filename,
						sizeBytes: attachments.sizeBytes,
						contentHashSha256: attachments.contentHashSha256,
						storagePath: attachments.storagePath,
					})
					.from(emailAttachments)
					.innerJoin(attachments, eq(emailAttachments.attachmentId, attachments.id))
					.where(eq(emailAttachments.emailId, emailId))
			: [];

		const tombstone = await this.deletedEmailTombstoneService.createAndSubmitTombstone({
			email: {
				id: email.id,
				ingestionSourceId: email.ingestionSourceId,
				messageIdHeader: email.messageIdHeader,
				subject: email.subject,
				senderEmail: email.senderEmail,
				sentAt: email.sentAt,
				archivedAt: email.archivedAt,
				sizeBytes: email.sizeBytes,
				storageHashSha256: email.storageHashSha256,
				verificationRootHash: email.verificationRootHash ?? null,
			},
			attachments: attachmentsForEmail.map((attachment) => ({
				attachmentId: attachment.attachmentId,
				filename: attachment.filename,
				sizeBytes: attachment.sizeBytes,
				contentHashSha256: attachment.contentHashSha256,
			})),
			actorIdentifier: actor.id,
			actorIp,
			reason: options.systemDelete
				? deletionReason || 'Retention expiration'
				: deletionReason,
			deletionMode: options.systemDelete ? 'retention' : 'manual',
			governingRule: options.governingRule,
		});

		try {
			// Load and handle attachments before deleting the email itself
			if (email.hasAttachments) {
				for (const attachment of attachmentsForEmail) {
					// Delete the link between this email and the attachment record.
					await db
						.delete(emailAttachments)
						.where(
							and(
								eq(emailAttachments.emailId, emailId),
								eq(emailAttachments.attachmentId, attachment.attachmentId)
							)
						);

					// Check if any other emails are linked to this attachment record.
					const [recordRefCount] = await db
						.select({ count: count() })
						.from(emailAttachments)
						.where(eq(emailAttachments.attachmentId, attachment.attachmentId));

					// If no other emails are linked to this record, it's safe to delete it and the file.
					if (recordRefCount.count === 0) {
						await storage.delete(attachment.storagePath);
						await db
							.delete(attachments)
							.where(eq(attachments.id, attachment.attachmentId));
					}
				}
			}

			// Delete the email file from storage
			await storage.delete(email.storagePath);

			const searchService = new SearchService();
			await searchService.deleteDocuments('emails', [emailId]);

			await db.delete(archivedEmails).where(eq(archivedEmails.id, emailId));
			await this.deletedEmailTombstoneService.markDeletionCompleted(tombstone.id);
		} catch (error) {
			await this.deletedEmailTombstoneService.markDeletionFailed(tombstone.id, error);
			if (error instanceof Error) {
				throw error;
			}
			throw new Error('Failed to delete archived email');
		}

		// Build audit details: system-initiated deletions carry retention context
		// for GoBD compliance; manual deletions record only the reason.
		const auditDetails: Record<string, unknown> = {
			deletionMode: options.systemDelete ? 'RetentionExpiration' : 'ManualDeletion',
			reason: options.systemDelete
				? deletionReason || 'Retention expiration'
				: deletionReason,
			tombstone: {
				id: tombstone.id,
				key: tombstone.tombstoneKey,
				rootHash: tombstone.tombstoneRootHash,
				externalSubmissionStatus: tombstone.externalSubmissionStatus,
			},
			evidence: {
				messageIdHeader: email.messageIdHeader,
				subject: email.subject,
				senderEmail: email.senderEmail,
				sentAt: email.sentAt,
				archivedAt: email.archivedAt,
				ingestionSourceId: email.ingestionSourceId,
				sizeBytes: email.sizeBytes,
				storageHashSha256: email.storageHashSha256,
				verificationRootHash: email.verificationRootHash ?? null,
				hadAttachments: email.hasAttachments,
				attachments: attachmentsForEmail.map((attachment) => ({
					attachmentId: attachment.attachmentId,
					filename: attachment.filename,
					sizeBytes: attachment.sizeBytes,
					contentHashSha256: attachment.contentHashSha256,
				})),
			},
		};
		if (options.systemDelete && options.governingRule) {
			auditDetails.governingRule = options.governingRule;
		}

		await this.auditService.createAuditLog({
			actorIdentifier: actor.id,
			actionType: 'DELETE',
			targetType: 'ArchivedEmail',
			targetId: emailId,
			actorIp,
			details: auditDetails,
		});
	}
}

export {
	ARCHIVED_EMAIL_NOT_FOUND,
	DELETION_BLOCKED_BY_RETENTION,
	EXTERNAL_TOMBSTONE_SUBMISSION_FAILED,
	MANUAL_DELETE_REASON_REQUIRED,
	MANUAL_DELETE_REASON_TOO_SHORT,
	NOT_AUTHORIZED_TO_DELETE,
};

import { createHash, randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../database';
import { deletedEmailTombstones } from '../database/schema';
import { AuditProofService } from './AuditProofService';
import { SettingsService } from './SettingsService';

type DeletionMode = 'manual' | 'retention';
type ExternalAnchorStatus = 'pending' | 'anchored' | 'failed' | 'skipped_not_configured';
type PhysicalDeletionStatus = 'pending' | 'completed' | 'failed';

interface TombstoneAttachmentEvidence {
	attachmentId: string;
	filename: string;
	sizeBytes: number;
	contentHashSha256: string;
}

interface TombstoneEmailEvidence {
	id: string;
	ingestionSourceId: string;
	messageIdHeader: string | null;
	subject: string | null;
	senderEmail: string;
	sentAt: Date;
	archivedAt: Date;
	sizeBytes: number;
	storageHashSha256: string;
	verificationRootHash: string | null;
}

interface CreateDeletedEmailTombstoneInput {
	email: TombstoneEmailEvidence;
	attachments: TombstoneAttachmentEvidence[];
	actorIdentifier: string;
	actorIp: string;
	reason: string;
	deletionMode: DeletionMode;
	governingRule?: string;
	deletedAt?: Date;
}

interface TombstoneAttachmentManifestEntry {
	attachmentId: string;
	filename: string;
	sizeBytes: number;
	contentHashSha256: string;
}

export interface DeletedEmailTombstoneRecord {
	id: string;
	tombstoneKey: string;
	tombstoneRootHash: string;
	deletedAt: Date;
	externalAnchorStatus: ExternalAnchorStatus;
	physicalDeletionStatus: PhysicalDeletionStatus;
}

export class DeletedEmailTombstoneService {
	private auditProofService = new AuditProofService();
	private settingsService = new SettingsService();

	private canonicalStringify(obj: unknown): string {
		if (obj === undefined) {
			return 'null';
		}
		if (obj === null || typeof obj !== 'object') {
			return JSON.stringify(obj);
		}
		if (Array.isArray(obj)) {
			return `[${obj.map((item) => this.canonicalStringify(item)).join(',')}]`;
		}

		const keys = Object.keys(obj).sort();
		const pairs = keys.map(
			(key) =>
				`${JSON.stringify(key)}:${this.canonicalStringify((obj as Record<string, unknown>)[key])}`
		);

		return `{${pairs.join(',')}}`;
	}

	private sortAttachments(
		attachments: TombstoneAttachmentEvidence[]
	): TombstoneAttachmentManifestEntry[] {
		return [...attachments]
			.map((attachment) => ({
				attachmentId: attachment.attachmentId,
				filename: attachment.filename,
				sizeBytes: attachment.sizeBytes,
				contentHashSha256: attachment.contentHashSha256,
			}))
			.sort((left, right) => {
				const filenameCompare = left.filename.localeCompare(right.filename);
				if (filenameCompare !== 0) {
					return filenameCompare;
				}
				if (left.sizeBytes !== right.sizeBytes) {
					return left.sizeBytes - right.sizeBytes;
				}
				const hashCompare = left.contentHashSha256.localeCompare(right.contentHashSha256);
				if (hashCompare !== 0) {
					return hashCompare;
				}

				return left.attachmentId.localeCompare(right.attachmentId);
			});
	}

	private buildManifest(
		input: CreateDeletedEmailTombstoneInput,
		tombstoneId: string,
		deletedAt: Date,
		attachmentManifest: TombstoneAttachmentManifestEntry[]
	) {
		return {
			schemaVersion: 1,
			tombstoneType: 'ArchivedEmailDeletion',
			tombstoneId,
			archivedEmailId: input.email.id,
			ingestionSourceId: input.email.ingestionSourceId,
			messageIdHeader: input.email.messageIdHeader,
			subject: input.email.subject,
			senderEmail: input.email.senderEmail,
			sentAt: input.email.sentAt.toISOString(),
			archivedAt: input.email.archivedAt.toISOString(),
			deletedAt: deletedAt.toISOString(),
			deletedByIdentifier: input.actorIdentifier,
			deletedByIp: input.actorIp,
			deletionMode: input.deletionMode,
			deletionReason: input.reason,
			governingRule: input.governingRule ?? null,
			sizeBytes: input.email.sizeBytes,
			storageHashSha256: input.email.storageHashSha256,
			verificationRootHash: input.email.verificationRootHash,
			attachments: attachmentManifest,
		};
	}

	private computeTombstoneRootHash(manifest: Record<string, unknown>): string {
		return createHash('sha256').update(this.canonicalStringify(manifest)).digest('hex');
	}

	private isStoreSuccess(
		result: Awaited<ReturnType<AuditProofService['saveHashForKey']>>
	): boolean {
		if (!result) {
			return false;
		}

		return result.httpStatus >= 200 && result.httpStatus < 300 && result.res !== 'ERROR';
	}

	public async createAndAnchorTombstone(
		input: CreateDeletedEmailTombstoneInput
	): Promise<DeletedEmailTombstoneRecord> {
		const deletedAt = input.deletedAt ?? new Date();
		const tombstoneId = randomUUID();
		const attachmentManifest = this.sortAttachments(input.attachments);
		const manifest = this.buildManifest(input, tombstoneId, deletedAt, attachmentManifest);
		const tombstoneRootHash = this.computeTombstoneRootHash(manifest);
		const settings = await this.settingsService.getSystemSettings();
		const tombstoneKey = this.auditProofService.buildTombstoneKey(
			settings,
			tombstoneId,
			input.email.id
		);

		const [created] = await db
			.insert(deletedEmailTombstones)
			.values({
				id: tombstoneId,
				archivedEmailId: input.email.id,
				ingestionSourceId: input.email.ingestionSourceId,
				tombstoneKey,
				deletionMode: input.deletionMode,
				deletionReason: input.reason,
				governingRule: input.governingRule ?? null,
				actorIdentifier: input.actorIdentifier,
				actorIp: input.actorIp,
				messageIdHeader: input.email.messageIdHeader,
				subject: input.email.subject,
				senderEmail: input.email.senderEmail,
				sentAt: input.email.sentAt,
				archivedAt: input.email.archivedAt,
				deletedAt,
				sizeBytes: input.email.sizeBytes,
				storageHashSha256: input.email.storageHashSha256,
				verificationRootHash: input.email.verificationRootHash,
				attachmentManifest,
				tombstoneManifest: manifest,
				tombstoneRootHash,
				externalAnchorStatus: 'pending',
				physicalDeletionStatus: 'pending',
			})
			.returning({
				id: deletedEmailTombstones.id,
				tombstoneKey: deletedEmailTombstones.tombstoneKey,
				tombstoneRootHash: deletedEmailTombstones.tombstoneRootHash,
				deletedAt: deletedEmailTombstones.deletedAt,
				externalAnchorStatus: deletedEmailTombstones.externalAnchorStatus,
				physicalDeletionStatus: deletedEmailTombstones.physicalDeletionStatus,
			});

		if (!this.auditProofService.isConfigured(settings)) {
			const [updated] = await db
				.update(deletedEmailTombstones)
				.set({
					externalAnchorStatus: 'skipped_not_configured',
					updatedAt: new Date(),
				})
				.where(eq(deletedEmailTombstones.id, tombstoneId))
				.returning({
					id: deletedEmailTombstones.id,
					tombstoneKey: deletedEmailTombstones.tombstoneKey,
					tombstoneRootHash: deletedEmailTombstones.tombstoneRootHash,
					deletedAt: deletedEmailTombstones.deletedAt,
					externalAnchorStatus: deletedEmailTombstones.externalAnchorStatus,
					physicalDeletionStatus: deletedEmailTombstones.physicalDeletionStatus,
				});

			return updated ?? created;
		}

		try {
			const externalResponse = await this.auditProofService.saveTombstoneHash(
				settings,
				tombstoneKey,
				tombstoneRootHash
			);
			const externalAnchorStatus: ExternalAnchorStatus = this.isStoreSuccess(externalResponse)
				? 'anchored'
				: 'failed';

			const [updated] = await db
				.update(deletedEmailTombstones)
				.set({
					externalAnchorStatus,
					externalAnchorResponse: externalResponse,
					externalAnchoredAt: externalAnchorStatus === 'anchored' ? new Date() : null,
					failureReason:
						externalAnchorStatus === 'failed'
							? (externalResponse?.msg ??
								'Audit-proof backend rejected tombstone anchor')
							: null,
					updatedAt: new Date(),
				})
				.where(eq(deletedEmailTombstones.id, tombstoneId))
				.returning({
					id: deletedEmailTombstones.id,
					tombstoneKey: deletedEmailTombstones.tombstoneKey,
					tombstoneRootHash: deletedEmailTombstones.tombstoneRootHash,
					deletedAt: deletedEmailTombstones.deletedAt,
					externalAnchorStatus: deletedEmailTombstones.externalAnchorStatus,
					physicalDeletionStatus: deletedEmailTombstones.physicalDeletionStatus,
				});

			if (externalAnchorStatus !== 'anchored') {
				throw new Error('External tombstone anchor failed');
			}

			return updated ?? created;
		} catch (error) {
			await db
				.update(deletedEmailTombstones)
				.set({
					externalAnchorStatus: 'failed',
					failureReason:
						error instanceof Error
							? error.message
							: 'Unknown audit-proof tombstone failure',
					updatedAt: new Date(),
				})
				.where(eq(deletedEmailTombstones.id, tombstoneId));

			throw new Error('External tombstone anchor failed');
		}
	}

	public async markDeletionCompleted(tombstoneId: string): Promise<void> {
		await db
			.update(deletedEmailTombstones)
			.set({
				physicalDeletionStatus: 'completed',
				physicalDeletionCompletedAt: new Date(),
				failureReason: null,
				updatedAt: new Date(),
			})
			.where(eq(deletedEmailTombstones.id, tombstoneId));
	}

	public async markDeletionFailed(tombstoneId: string, error: unknown): Promise<void> {
		await db
			.update(deletedEmailTombstones)
			.set({
				physicalDeletionStatus: 'failed',
				failureReason:
					error instanceof Error ? error.message : 'Unknown physical deletion failure',
				updatedAt: new Date(),
			})
			.where(eq(deletedEmailTombstones.id, tombstoneId));
	}
}

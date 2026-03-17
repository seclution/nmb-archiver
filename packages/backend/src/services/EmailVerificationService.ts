import { createHash } from 'crypto';
import type {
	ExternalProofResult,
	IntegrityCheckResult,
	LocalIntegrityResult,
	NmbRevisionProofVerifyResult,
	VerificationManifestAttachment,
} from '@open-archiver/types';
import { eq } from 'drizzle-orm';
import {
	attachments,
	emailAttachments,
	type archivedEmails as archivedEmailsSchema,
} from '../database/schema';
import { StorageService } from './StorageService';
import { streamToBuffer } from '../helpers/streamToBuffer';
import { SettingsService } from './SettingsService';
import { logger } from '../config/logger';
import { db } from '../database';
import {
	buildVerificationManifest,
	computeVerificationRootHash,
	type VerificationManifest,
} from '../helpers/verificationManifest';
import { NmbRevisionProofService } from './NmbRevisionProofService';
import { NmbRevisionProofSubmissionService } from './NmbRevisionProofSubmissionService';

type ArchivedEmailRecord = typeof archivedEmailsSchema.$inferSelect;

export interface EmailVerificationResult {
	raw: Buffer;
	hashSha256: string;
	verificationRootHash: string;
	manifest: VerificationManifest;
	integrityReport: IntegrityCheckResult[];
	localIntegrity: LocalIntegrityResult;
	externalProof: ExternalProofResult;
	nmbRevisionProofVerifyResult: NmbRevisionProofVerifyResult | null;
}

export class EmailVerificationService {
	private storageService = new StorageService();
	private settingsService = new SettingsService();
	private nmbRevisionProofService = new NmbRevisionProofService();
	private nmbRevisionProofSubmissionService = new NmbRevisionProofSubmissionService();

	public async verifyEmail(
		email: ArchivedEmailRecord,
		options?: { includeExternalProof?: boolean }
	): Promise<EmailVerificationResult> {
		const emailStream = await this.storageService.get(email.storagePath);
		const raw = await streamToBuffer(emailStream);
		const hashSha256 = createHash('sha256').update(raw).digest('hex');

		const integrityReport: IntegrityCheckResult[] = [];
		const emailIntegrityResult: IntegrityCheckResult =
			hashSha256 === email.storageHashSha256
				? { type: 'email', id: email.id, isValid: true }
				: {
						type: 'email',
						id: email.id,
						isValid: false,
						reason: 'Stored hash does not match current hash.',
					};
		integrityReport.push(emailIntegrityResult);

		const attachmentManifestEntries: VerificationManifestAttachment[] = [];

		const emailAttachmentRelations = email.hasAttachments
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
					.where(eq(emailAttachments.emailId, email.id))
			: [];

		for (const relation of emailAttachmentRelations) {
			const attachmentManifest: VerificationManifestAttachment = {
				filename: relation.filename,
				sizeBytes: relation.sizeBytes,
				contentHashSha256: relation.contentHashSha256,
			};

			try {
				const attachmentStream = await this.storageService.get(relation.storagePath);
				const attachmentBuffer = await streamToBuffer(attachmentStream);
				const currentAttachmentHash = createHash('sha256')
					.update(attachmentBuffer)
					.digest('hex');

				attachmentManifestEntries.push({
					...attachmentManifest,
					contentHashSha256: currentAttachmentHash,
				});

				if (currentAttachmentHash === relation.contentHashSha256) {
					integrityReport.push({
						type: 'attachment',
						id: relation.attachmentId,
						filename: relation.filename,
						isValid: true,
					});
				} else {
					integrityReport.push({
						type: 'attachment',
						id: relation.attachmentId,
						filename: relation.filename,
						isValid: false,
						reason: 'Stored hash does not match current hash.',
					});
				}
			} catch (error) {
				logger.error(
					{ attachmentId: relation.attachmentId, error },
					'Failed to read attachment from storage for integrity check.'
				);
				attachmentManifestEntries.push(attachmentManifest);
				integrityReport.push({
					type: 'attachment',
					id: relation.attachmentId,
					filename: relation.filename,
					isValid: false,
					reason: 'Could not read attachment file from storage.',
				});
			}
		}

		const manifest = buildVerificationManifest(hashSha256, attachmentManifestEntries);
		const verificationRootHash = computeVerificationRootHash(manifest);
		const nmbRevisionProofState = await this.nmbRevisionProofSubmissionService.getEmailRecord(
			email.id
		);
		const storedVerificationRootHash = nmbRevisionProofState?.verificationRootHash ?? null;

		if (storedVerificationRootHash) {
			integrityReport.push(
				storedVerificationRootHash === verificationRootHash
					? {
							type: 'verification_root',
							id: email.id,
							filename: 'Stored verification root hash',
							isValid: true,
						}
					: {
							type: 'verification_root',
							id: email.id,
							filename: 'Stored verification root hash',
							isValid: false,
							reason: 'Stored verification root hash does not match the recomputed manifest hash.',
						}
			);
		}

		const localIntegrity: LocalIntegrityResult = {
			isValid: integrityReport.every((item) => item.isValid),
			integrityReport,
		};

		let nmbRevisionProofVerifyResult: NmbRevisionProofVerifyResult | null = null;
		let externalProof: ExternalProofResult = {
			isValid: false,
			verificationRootHash,
			details: null,
		};

		if (options?.includeExternalProof) {
			try {
				const systemSettings = await this.settingsService.getSystemSettings();
				nmbRevisionProofVerifyResult = await this.nmbRevisionProofService.verifyEmailHash(
					systemSettings,
					email.id,
					verificationRootHash,
					Math.floor(new Date(email.archivedAt).getTime() / 1000)
				);
				externalProof = {
					isValid: nmbRevisionProofVerifyResult?.res === 'PASSED',
					verificationRootHash,
					details: nmbRevisionProofVerifyResult,
				};
			} catch (error) {
				logger.warn(
					{ emailId: email.id, error },
					'Failed to verify email hash with NMB revision-proof backend'
				);
				nmbRevisionProofVerifyResult = {
					res: 'ERROR',
					msg: 'NMB revision-proof verification failed',
					error: error instanceof Error ? error.message : 'Unknown error',
				};
				externalProof = {
					isValid: false,
					verificationRootHash,
					details: nmbRevisionProofVerifyResult,
				};
			}
		}

		return {
			raw,
			hashSha256,
			manifest,
			verificationRootHash,
			integrityReport,
			localIntegrity,
			externalProof,
			nmbRevisionProofVerifyResult,
		};
	}
}

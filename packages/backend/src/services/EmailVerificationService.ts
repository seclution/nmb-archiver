import { createHash } from 'crypto';
import type { AuditProofVerificationResult, IntegrityCheckResult } from '@open-archiver/types';
import type { archivedEmails as archivedEmailsSchema } from '../database/schema';
import { StorageService } from './StorageService';
import { streamToBuffer } from '../helpers/streamToBuffer';
import { SettingsService } from './SettingsService';
import { AuditProofService } from './AuditProofService';
import { logger } from '../config/logger';

type ArchivedEmailRecord = typeof archivedEmailsSchema.$inferSelect;

export interface EmailVerificationResult {
	raw: Buffer;
	hashSha256: string;
	localIntegrityResult: IntegrityCheckResult;
	auditProofVerification: AuditProofVerificationResult | null;
}

export class EmailVerificationService {
	private storageService = new StorageService();
	private settingsService = new SettingsService();
	private auditProofService = new AuditProofService();

	public async verifyEmail(
		email: ArchivedEmailRecord,
		options?: { includeAuditProof?: boolean }
	): Promise<EmailVerificationResult> {
		const emailStream = await this.storageService.get(email.storagePath);
		const raw = await streamToBuffer(emailStream);
		const hashSha256 = createHash('sha256').update(raw).digest('hex');

		let auditProofVerification: AuditProofVerificationResult | null = null;
		if (options?.includeAuditProof) {
			try {
				const systemSettings = await this.settingsService.getSystemSettings();
				auditProofVerification = await this.auditProofService.verifyEmailHash(
					systemSettings,
					email.id,
					hashSha256,
					Math.floor(new Date(email.archivedAt).getTime() / 1000)
				);
			} catch (error) {
				logger.warn(
					{ emailId: email.id, error },
					'Failed to verify email hash with audit-proof backend'
				);
				auditProofVerification = {
					res: 'ERROR',
					msg: 'Audit-proof verification failed',
					error: error instanceof Error ? error.message : 'Unknown error',
				};
			}
		}

		return {
			raw,
			hashSha256,
			localIntegrityResult:
				hashSha256 === email.storageHashSha256
					? { type: 'email', id: email.id, isValid: true }
					: {
							type: 'email',
							id: email.id,
							isValid: false,
							reason: 'Stored hash does not match current hash.',
						},
			auditProofVerification,
		};
	}
}

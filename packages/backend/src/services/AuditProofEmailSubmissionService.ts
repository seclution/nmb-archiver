import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { db } from '../database';
import { archivedEmails } from '../database/schema';
import { AuditProofService } from './AuditProofService';
import { SettingsService } from './SettingsService';
import { auditProofSubmissionQueue } from '../jobs/queues';
import { logger } from '../config/logger';

export interface SubmitEmailProofJobData {
	archivedEmailId: string;
}

export const SUBMIT_EMAIL_PROOF_JOB_NAME = 'submit-email-proof';

export class AuditProofEmailSubmissionService {
	private auditProofService = new AuditProofService();
	private settingsService = new SettingsService();

	public async enqueueEmailSubmission(archivedEmailId: string): Promise<void> {
		const jobId = `submit-email-proof:${archivedEmailId}`;
		const existingJob = await auditProofSubmissionQueue.getJob(jobId);
		if (existingJob) {
			const state = await existingJob.getState();
			if (state === 'completed' || state === 'failed') {
				await existingJob.remove();
			} else {
				return;
			}
		}

		await auditProofSubmissionQueue.add(
			SUBMIT_EMAIL_PROOF_JOB_NAME,
			{ archivedEmailId },
			{ jobId }
		);
	}

	public async enqueueRetryBatch(limit: number = 500): Promise<number> {
		const systemSettings = await this.settingsService.getSystemSettings();
		if (!this.auditProofService.isConfigured(systemSettings)) {
			return 0;
		}

		const pendingEmails = await db
			.select({ id: archivedEmails.id })
			.from(archivedEmails)
			.where(
				and(
					isNotNull(archivedEmails.verificationRootHash),
					inArray(archivedEmails.auditProofSubmissionStatus, [
						'pending',
						'failed',
						'skipped_not_configured',
					])
				)
			)
			.limit(limit);

		for (const email of pendingEmails) {
			await this.enqueueEmailSubmission(email.id);
		}

		return pendingEmails.length;
	}

	public async processEmailSubmission(archivedEmailId: string): Promise<void> {
		const [email] = await db
			.select({
				id: archivedEmails.id,
				verificationRootHash: archivedEmails.verificationRootHash,
				auditProofSubmissionStatus: archivedEmails.auditProofSubmissionStatus,
			})
			.from(archivedEmails)
			.where(eq(archivedEmails.id, archivedEmailId));

		if (!email) {
			logger.warn({ archivedEmailId }, 'Skipping audit-proof submission for missing email');
			return;
		}

		if (email.auditProofSubmissionStatus === 'submitted') {
			return;
		}

		if (!email.verificationRootHash) {
			await db
				.update(archivedEmails)
				.set({
					auditProofSubmissionStatus: 'failed',
					auditProofLastSubmissionAttemptAt: new Date(),
					auditProofSubmissionAttempts: sql`${archivedEmails.auditProofSubmissionAttempts} + 1`,
					auditProofLastSubmissionError: 'Verification root hash is missing',
				})
				.where(eq(archivedEmails.id, archivedEmailId));
			return;
		}

		const systemSettings = await this.settingsService.getSystemSettings();
		if (!this.auditProofService.isConfigured(systemSettings)) {
			await db
				.update(archivedEmails)
				.set({
					auditProofSubmissionStatus: 'skipped_not_configured',
					auditProofLastSubmissionError: null,
				})
				.where(eq(archivedEmails.id, archivedEmailId));

			logger.info(
				{ archivedEmailId },
				'Skipping audit-proof submission because the backend is not configured'
			);
			return;
		}

		await db
			.update(archivedEmails)
			.set({
				auditProofLastSubmissionAttemptAt: new Date(),
				auditProofSubmissionAttempts: sql`${archivedEmails.auditProofSubmissionAttempts} + 1`,
			})
			.where(eq(archivedEmails.id, archivedEmailId));

		try {
			const response = await this.auditProofService.saveEmailHash(
				systemSettings,
				archivedEmailId,
				email.verificationRootHash
			);

			const submissionAccepted =
				response !== null &&
				response.httpStatus >= 200 &&
				response.httpStatus < 300 &&
				response.res !== 'ERROR';

			await db
				.update(archivedEmails)
				.set({
					auditProofSubmissionStatus: submissionAccepted ? 'submitted' : 'failed',
					auditProofSubmittedAt: submissionAccepted ? new Date() : null,
					auditProofLastSubmissionError: submissionAccepted
						? null
						: (response?.msg ?? 'Audit-proof backend rejected submission'),
				})
				.where(eq(archivedEmails.id, archivedEmailId));

			if (!submissionAccepted) {
				throw new Error(response?.msg ?? 'Audit-proof backend rejected submission');
			}
		} catch (error) {
			await db
				.update(archivedEmails)
				.set({
					auditProofSubmissionStatus: 'failed',
					auditProofLastSubmissionError:
						error instanceof Error
							? error.message
							: 'Unknown audit-proof submission error',
				})
				.where(eq(archivedEmails.id, archivedEmailId));

			throw error;
		}
	}
}

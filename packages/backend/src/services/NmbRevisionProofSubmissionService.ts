import type {
	NmbRevisionProofOverview,
	NmbRevisionProofState,
	NmbRevisionProofSubmissionStatus,
} from '@open-archiver/types';
import { count, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../database';
import { archivedEmails, nmbRevisionProofEmailRecords } from '../database/schema';
import { logger } from '../config/logger';
import { SettingsService } from './SettingsService';
import { NmbRevisionProofService } from './NmbRevisionProofService';
import { nmbRevisionProofQueue } from '../jobs/queues';

export interface SubmitNmbRevisionProofJobData {
	archivedEmailId: string;
}

export const NMB_REVISION_PROOF_SUBMIT_EMAIL_JOB_NAME = 'nmb-revision-proof-submit-email';
export const NMB_REVISION_PROOF_SCHEDULE_RETRY_JOB_NAME =
	'schedule-nmb-revision-proof-submission-retry';

const REQUEUEABLE_STATUSES: NmbRevisionProofSubmissionStatus[] = [
	'pending',
	'failed',
	'skipped_not_configured',
];

type NmbRevisionProofEmailRecord = typeof nmbRevisionProofEmailRecords.$inferSelect;

export class NmbRevisionProofSubmissionService {
	private settingsService = new SettingsService();
	private nmbRevisionProofService = new NmbRevisionProofService();

	public async upsertPendingSubmission(
		archivedEmailId: string,
		verificationRootHash: string
	): Promise<void> {
		await db
			.insert(nmbRevisionProofEmailRecords)
			.values({
				archivedEmailId,
				verificationRootHash,
				submissionStatus: 'pending',
				submittedAt: null,
				lastSubmissionAttemptAt: null,
				submissionAttempts: 0,
				lastSubmissionError: null,
				updatedAt: new Date(),
			})
			.onConflictDoUpdate({
				target: nmbRevisionProofEmailRecords.archivedEmailId,
				set: {
					verificationRootHash,
					submissionStatus: 'pending',
					submittedAt: null,
					lastSubmissionAttemptAt: null,
					submissionAttempts: 0,
					lastSubmissionError: null,
					updatedAt: new Date(),
				},
			});
	}

	public async getEmailRecord(archivedEmailId: string): Promise<NmbRevisionProofState | null> {
		const [record] = await db
			.select()
			.from(nmbRevisionProofEmailRecords)
			.where(eq(nmbRevisionProofEmailRecords.archivedEmailId, archivedEmailId))
			.limit(1);

		return record ? this.mapRecordToState(record) : null;
	}

	public async enqueueEmailSubmission(archivedEmailId: string): Promise<void> {
		const jobId = `${NMB_REVISION_PROOF_SUBMIT_EMAIL_JOB_NAME}:${archivedEmailId}`;
		const existingJob = await nmbRevisionProofQueue.getJob(jobId);
		if (existingJob) {
			const state = await existingJob.getState();
			if (state === 'completed' || state === 'failed') {
				await existingJob.remove();
			} else {
				return;
			}
		}

		await nmbRevisionProofQueue.add(
			NMB_REVISION_PROOF_SUBMIT_EMAIL_JOB_NAME,
			{ archivedEmailId },
			{ jobId }
		);
	}

	public async enqueueRetryBatch(limit: number = 500): Promise<number> {
		const systemSettings = await this.settingsService.getSystemSettings();
		if (!this.nmbRevisionProofService.isConfigured(systemSettings)) {
			return 0;
		}

		const pendingEmails = await db
			.select({ archivedEmailId: nmbRevisionProofEmailRecords.archivedEmailId })
			.from(nmbRevisionProofEmailRecords)
			.where(inArray(nmbRevisionProofEmailRecords.submissionStatus, REQUEUEABLE_STATUSES))
			.orderBy(desc(nmbRevisionProofEmailRecords.updatedAt))
			.limit(limit);

		for (const email of pendingEmails) {
			await this.enqueueEmailSubmission(email.archivedEmailId);
		}

		return pendingEmails.length;
	}

	public async processEmailSubmission(archivedEmailId: string): Promise<void> {
		const [emailRecord] = await db
			.select({
				id: archivedEmails.id,
			})
			.from(archivedEmails)
			.where(eq(archivedEmails.id, archivedEmailId))
			.limit(1);

		if (!emailRecord) {
			logger.warn(
				{ archivedEmailId },
				'Skipping NMB revision-proof submission for missing email'
			);
			return;
		}

		const [record] = await db
			.select()
			.from(nmbRevisionProofEmailRecords)
			.where(eq(nmbRevisionProofEmailRecords.archivedEmailId, archivedEmailId))
			.limit(1);

		if (!record) {
			logger.warn(
				{ archivedEmailId },
				'Skipping NMB revision-proof submission because the sidecar record is missing'
			);
			return;
		}

		if (record.submissionStatus === 'submitted') {
			return;
		}

		if (!record.verificationRootHash) {
			await this.markSubmissionFailure(archivedEmailId, 'Verification root hash is missing');
			return;
		}

		const systemSettings = await this.settingsService.getSystemSettings();
		if (!this.nmbRevisionProofService.isConfigured(systemSettings)) {
			await db
				.update(nmbRevisionProofEmailRecords)
				.set({
					submissionStatus: 'skipped_not_configured',
					lastSubmissionError: null,
					updatedAt: new Date(),
				})
				.where(eq(nmbRevisionProofEmailRecords.archivedEmailId, archivedEmailId));

			logger.info(
				{ archivedEmailId },
				'Skipping NMB revision-proof submission because the backend is not configured'
			);
			return;
		}

		await db
			.update(nmbRevisionProofEmailRecords)
			.set({
				lastSubmissionAttemptAt: new Date(),
				submissionAttempts: sql`${nmbRevisionProofEmailRecords.submissionAttempts} + 1`,
				updatedAt: new Date(),
			})
			.where(eq(nmbRevisionProofEmailRecords.archivedEmailId, archivedEmailId));

		try {
			const response = await this.nmbRevisionProofService.saveEmailHash(
				systemSettings,
				archivedEmailId,
				record.verificationRootHash
			);

			const submissionAccepted =
				response !== null &&
				response.httpStatus >= 200 &&
				response.httpStatus < 300 &&
				response.res !== 'ERROR';

			await db
				.update(nmbRevisionProofEmailRecords)
				.set({
					submissionStatus: submissionAccepted ? 'submitted' : 'failed',
					submittedAt: submissionAccepted ? new Date() : null,
					lastSubmissionError: submissionAccepted
						? null
						: (response?.msg ?? 'NMB revision-proof backend rejected submission'),
					updatedAt: new Date(),
				})
				.where(eq(nmbRevisionProofEmailRecords.archivedEmailId, archivedEmailId));

			if (!submissionAccepted) {
				throw new Error(response?.msg ?? 'NMB revision-proof backend rejected submission');
			}
		} catch (error) {
			await this.markSubmissionFailure(
				archivedEmailId,
				error instanceof Error
					? error.message
					: 'Unknown NMB revision-proof submission error'
			);
			throw error;
		}
	}

	public async getOverview(): Promise<NmbRevisionProofOverview> {
		const systemSettings = await this.settingsService.getSystemSettings();
		const [totals] = await db
			.select({
				totalTrackedEmails: count(nmbRevisionProofEmailRecords.id),
				lastSubmissionAttemptAt: sql<Date | null>`max(${nmbRevisionProofEmailRecords.lastSubmissionAttemptAt})`,
			})
			.from(nmbRevisionProofEmailRecords);

		const groupedStatuses = await db
			.select({
				status: nmbRevisionProofEmailRecords.submissionStatus,
				total: count(nmbRevisionProofEmailRecords.id),
			})
			.from(nmbRevisionProofEmailRecords)
			.groupBy(nmbRevisionProofEmailRecords.submissionStatus);

		const counts = {
			pending: 0,
			submitted: 0,
			failed: 0,
			skipped_not_configured: 0,
		};

		for (const entry of groupedStatuses) {
			switch (entry.status) {
				case 'pending':
					counts.pending = entry.total;
					break;
				case 'submitted':
					counts.submitted = entry.total;
					break;
				case 'failed':
					counts.failed = entry.total;
					break;
				case 'skipped_not_configured':
					counts.skipped_not_configured = entry.total;
					break;
			}
		}

		return {
			isConfigured: this.nmbRevisionProofService.isConfigured(systemSettings),
			totalTrackedEmails: totals?.totalTrackedEmails ?? 0,
			pending: counts.pending,
			submitted: counts.submitted,
			failed: counts.failed,
			skippedNotConfigured: counts.skipped_not_configured,
			lastSubmissionAttemptAt: totals?.lastSubmissionAttemptAt ?? null,
		};
	}

	private async markSubmissionFailure(
		archivedEmailId: string,
		errorMessage: string
	): Promise<void> {
		await db
			.update(nmbRevisionProofEmailRecords)
			.set({
				submissionStatus: 'failed',
				lastSubmissionError: errorMessage,
				updatedAt: new Date(),
			})
			.where(eq(nmbRevisionProofEmailRecords.archivedEmailId, archivedEmailId));
	}

	private mapRecordToState(record: NmbRevisionProofEmailRecord): NmbRevisionProofState {
		return {
			verificationRootHash: record.verificationRootHash,
			submissionStatus: record.submissionStatus,
			submittedAt: record.submittedAt,
			lastSubmissionAttemptAt: record.lastSubmissionAttemptAt,
			submissionAttempts: record.submissionAttempts,
			lastSubmissionError: record.lastSubmissionError,
		};
	}
}

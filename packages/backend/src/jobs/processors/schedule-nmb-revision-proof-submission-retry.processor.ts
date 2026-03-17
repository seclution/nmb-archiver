import { Job } from 'bullmq';
import { logger } from '../../config/logger';
import { NmbRevisionProofSubmissionService } from '../../services/NmbRevisionProofSubmissionService';

const nmbRevisionProofSubmissionService = new NmbRevisionProofSubmissionService();

export default async (_job: Job) => {
	const enqueuedCount = await nmbRevisionProofSubmissionService.enqueueRetryBatch();
	logger.info(
		{ enqueuedCount },
		'Scheduled retry batch for NMB revision-proof email submissions'
	);
};

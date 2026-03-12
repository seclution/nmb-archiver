import { Job } from 'bullmq';
import { AuditProofEmailSubmissionService } from '../../services/AuditProofEmailSubmissionService';
import { logger } from '../../config/logger';

const auditProofEmailSubmissionService = new AuditProofEmailSubmissionService();

export default async (_job: Job) => {
	const enqueuedCount = await auditProofEmailSubmissionService.enqueueRetryBatch();
	logger.info({ enqueuedCount }, 'Scheduled retry batch for audit-proof email submissions');
};

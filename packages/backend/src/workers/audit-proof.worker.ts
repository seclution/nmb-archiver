import { Worker } from 'bullmq';
import { connection } from '../config/redis';
import submitEmailProofProcessor from '../jobs/processors/submit-email-proof.processor';
import scheduleAuditProofSubmissionRetryProcessor from '../jobs/processors/schedule-audit-proof-submission-retry.processor';
import { SUBMIT_EMAIL_PROOF_JOB_NAME } from '../services/AuditProofEmailSubmissionService';

const processor = async (job: any) => {
	switch (job.name) {
		case SUBMIT_EMAIL_PROOF_JOB_NAME:
			return submitEmailProofProcessor(job);
		case 'schedule-audit-proof-submission-retry':
			return scheduleAuditProofSubmissionRetryProcessor(job);
		default:
			throw new Error(`Unknown job name: ${job.name}`);
	}
};

const worker = new Worker('audit-proof-submission', processor, {
	connection,
	removeOnComplete: {
		count: 100,
	},
	removeOnFail: {
		count: 500,
	},
});

console.log('Audit-proof submission worker started');

process.on('SIGINT', () => worker.close());
process.on('SIGTERM', () => worker.close());

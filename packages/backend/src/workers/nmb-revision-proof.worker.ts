import { Worker } from 'bullmq';
import { connection } from '../config/redis';
import scheduleNmbRevisionProofSubmissionRetryProcessor from '../jobs/processors/schedule-nmb-revision-proof-submission-retry.processor';
import submitNmbRevisionProofEmailProcessor from '../jobs/processors/submit-nmb-revision-proof-email.processor';
import {
	NMB_REVISION_PROOF_SCHEDULE_RETRY_JOB_NAME,
	NMB_REVISION_PROOF_SUBMIT_EMAIL_JOB_NAME,
} from '../services/NmbRevisionProofSubmissionService';

const processor = async (job: any) => {
	switch (job.name) {
		case NMB_REVISION_PROOF_SUBMIT_EMAIL_JOB_NAME:
			return submitNmbRevisionProofEmailProcessor(job);
		case NMB_REVISION_PROOF_SCHEDULE_RETRY_JOB_NAME:
			return scheduleNmbRevisionProofSubmissionRetryProcessor(job);
		default:
			throw new Error(`Unknown job name: ${job.name}`);
	}
};

const worker = new Worker('nmb-revision-proof', processor, {
	connection,
	removeOnComplete: {
		count: 100,
	},
	removeOnFail: {
		count: 500,
	},
});

console.log('NMB revision-proof worker started');

process.on('SIGINT', () => worker.close());
process.on('SIGTERM', () => worker.close());

import { config } from '../../config';
import { nmbRevisionProofQueue } from '../queues';
import { NMB_REVISION_PROOF_SCHEDULE_RETRY_JOB_NAME } from '../../services/NmbRevisionProofSubmissionService';

const scheduleNmbRevisionProofSubmissionRetries = async () => {
	await nmbRevisionProofQueue.add(
		NMB_REVISION_PROOF_SCHEDULE_RETRY_JOB_NAME,
		{},
		{
			jobId: NMB_REVISION_PROOF_SCHEDULE_RETRY_JOB_NAME,
			repeat: {
				pattern: config.app.nmbRevisionProofSubmissionFrequency,
			},
		}
	);
};

scheduleNmbRevisionProofSubmissionRetries().then(() => {
	console.log('NMB revision-proof scheduler started.');
});

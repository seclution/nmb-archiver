import { auditProofSubmissionQueue, ingestionQueue } from '../queues';

import { config } from '../../config';

const scheduleContinuousSync = async () => {
	// This job will run every 15 minutes
	await ingestionQueue.add(
		'schedule-continuous-sync',
		{},
		{
			jobId: 'schedule-continuous-sync',
			repeat: {
				pattern: config.app.syncFrequency,
			},
		}
	);
};

const scheduleAuditProofSubmissionRetries = async () => {
	await auditProofSubmissionQueue.add(
		'schedule-audit-proof-submission-retry',
		{},
		{
			jobId: 'schedule-audit-proof-submission-retry',
			repeat: {
				pattern: config.app.auditProofSubmissionFrequency,
			},
		}
	);
};

Promise.all([scheduleContinuousSync(), scheduleAuditProofSubmissionRetries()]).then(() => {
	console.log('Background schedulers started.');
});

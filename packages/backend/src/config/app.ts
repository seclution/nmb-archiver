import 'dotenv/config';

export const app = {
	nodeEnv: process.env.NODE_ENV || 'development',
	port: process.env.PORT_BACKEND ? parseInt(process.env.PORT_BACKEND, 10) : 4000,
	encryptionKey: process.env.ENCRYPTION_KEY,
	syncFrequency: process.env.SYNC_FREQUENCY || '* * * * *', //default to 1 minute
	nmbRevisionProofSubmissionFrequency:
		process.env.NMB_REVISION_PROOF_SUBMISSION_FREQUENCY || '* * * * *',
	nmbRevisionProofRequestTimeoutMs: process.env.NMB_REVISION_PROOF_REQUEST_TIMEOUT_MS
		? parseInt(process.env.NMB_REVISION_PROOF_REQUEST_TIMEOUT_MS, 10)
		: 5000,
	enableDeletion: process.env.ENABLE_DELETION === 'true',
	allInclusiveArchive: process.env.ALL_INCLUSIVE_ARCHIVE === 'true',
};

import 'dotenv/config';

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
	const parsed = Number.parseInt(value ?? '', 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const app = {
	nodeEnv: process.env.NODE_ENV || 'development',
	port: process.env.PORT_BACKEND ? parseInt(process.env.PORT_BACKEND, 10) : 4000,
	encryptionKey: process.env.ENCRYPTION_KEY,
	syncFrequency: process.env.SYNC_FREQUENCY || '* * * * *', //default to 1 minute
	auditProofSubmissionFrequency:
		process.env.AUDIT_PROOF_SUBMISSION_FREQUENCY || '* * * * *',
	auditProofRequestTimeoutMs: parsePositiveInt(
		process.env.AUDIT_PROOF_REQUEST_TIMEOUT_MS,
		5000
	),
	enableDeletion: process.env.ENABLE_DELETION === 'true',
	allInclusiveArchive: process.env.ALL_INCLUSIVE_ARCHIVE === 'true',
};

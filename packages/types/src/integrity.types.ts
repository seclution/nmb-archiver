export interface IntegrityCheckResult {
	type: 'email' | 'attachment' | 'verification_root';
	id: string;
	filename?: string;
	isValid: boolean;
	reason?: string;
}

export interface VerificationManifestAttachment {
	filename: string;
	sizeBytes: number;
	contentHashSha256: string;
}

export interface VerificationManifestSummary {
	emailHashSha256: string;
	attachments: VerificationManifestAttachment[];
}

export interface LocalIntegrityResult {
	isValid: boolean;
	integrityReport: IntegrityCheckResult[];
}

export interface ExternalProofResult {
	isValid: boolean;
	verificationRootHash: string;
	details: {
		res: string;
		msg: string;
		httpStatus?: number;
		error?: string;
		log?: Record<string, { res: string; msg: string }>;
	} | null;
}

export interface EmailVerificationSummary {
	manifest: VerificationManifestSummary;
	verificationRootHash: string;
	localIntegrity: LocalIntegrityResult;
	externalProof: ExternalProofResult;
}

export interface IntegrityVerificationResponse {
	localIntegrity: LocalIntegrityResult;
	externalProof: ExternalProofResult;
}

export interface IntegrityCheckResult {
	type: 'email' | 'attachment';
	id: string;
	filename?: string;
	isValid: boolean;
	reason?: string;
}

export interface EmailVerificationSummary {
	integrityReport: IntegrityCheckResult[];
}

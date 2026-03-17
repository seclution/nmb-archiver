export type SupportedLanguage =
	| 'en' // English
	| 'es' // Spanish
	| 'fr' // French
	| 'de' // German
	| 'it' // Italian
	| 'pt' // Portuguese
	| 'nl' // Dutch
	| 'ja' // Japanese
	| 'et' // Estonian
	| 'el'; // Greek

export type Theme = 'light' | 'dark' | 'system';

export interface NmbRevisionProofSettings {
	instanceId: string | null;
	backendUrl: string | null;
	debugRequests: boolean;
	requestTimeoutMs: number;
}

export interface NmbRevisionProofOverview {
	isConfigured: boolean;
	totalTrackedEmails: number;
	pending: number;
	submitted: number;
	failed: number;
	skippedNotConfigured: number;
	lastSubmissionAttemptAt: Date | null;
}

export interface SystemSettings {
	/** The default display language for the application UI. */
	language: SupportedLanguage;

	/** The default color theme for the application. */
	theme: Theme;

	/** A public-facing email address for user support inquiries. */
	supportEmail: string | null;

	/** Namespace for NMB-specific revision-proof backend settings. */
	nmbRevisionProof: NmbRevisionProofSettings;
}

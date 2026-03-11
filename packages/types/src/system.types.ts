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
	| 'el' // Greek
	| 'bg'; // Bulgarian

export type Theme = 'light' | 'dark' | 'system';

export interface SystemSettings {
	/** The default display language for the application UI. */
	language: SupportedLanguage;

	/** The default color theme for the application. */
	theme: Theme;

	/** A public-facing email address for user support inquiries. */
	supportEmail: string | null;

	/** Prefix for the audit-proof backend key: `${auditProofInstanceId}:${archivedEmailId}`. */
	auditProofInstanceId: string | null;

	/** Base URL of the audit-proof backend instance, e.g. http://10.99.105.10 */
	auditProofInstanceServerAddr: string | null;

	/** Enables verbose logging of /save and /verify request payloads for troubleshooting. */
	auditProofDebugRequests: boolean;
}

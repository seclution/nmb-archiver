import type {
	EmailVerificationSummary,
	ExternalProofResult,
	LocalIntegrityResult,
} from './integrity.types';

/**
 * Represents a single recipient of an email.
 */
export interface Recipient {
	name?: string;
	email: string;
}

/**
 * Represents a single attachment of an email.
 */
export interface Attachment {
	id: string;
	filename: string;
	mimeType: string | null;
	sizeBytes: number;
	storagePath: string;
}

export interface ThreadEmail {
	id: string; //the archivedemail id
	subject: string | null;
	sentAt: Date;
	senderEmail: string;
}

export interface AuditProofVerificationLogItem {
	res: string;
	msg: string;
}

export interface AuditProofVerificationResult {
	res: string;
	msg: string;
	log?: Record<string, AuditProofVerificationLogItem>;
	httpStatus?: number;
	error?: string;
}

/**
 * Represents a single archived email.
 */
export interface ArchivedEmail {
	id: string;
	ingestionSourceId: string;
	userEmail: string;
	messageIdHeader: string | null;
	sentAt: Date;
	subject: string | null;
	senderName: string | null;
	senderEmail: string;
	recipients: Recipient[];
	storagePath: string;
	storageHashSha256: string;
	sizeBytes: number;
	isIndexed: boolean;
	hasAttachments: boolean;
	isOnLegalHold: boolean;
	archivedAt: Date;
	attachments?: Attachment[];
	raw?: Buffer;
	thread?: ThreadEmail[];
	path: string | null;
	tags: string[] | null;
	auditProofVerification?: AuditProofVerificationResult | null;
	localIntegrity?: LocalIntegrityResult;
	externalProof?: ExternalProofResult;
	verificationRootHash?: string | null;
	verification?: EmailVerificationSummary;
}

/**
 * Represents a paginated list of archived emails.
 */
export interface PaginatedArchivedEmails {
	items: ArchivedEmail[];
	total: number;
	page: number;
	limit: number;
}

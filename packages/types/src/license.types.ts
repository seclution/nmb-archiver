/**
 * Features of Open Archiver Enterprise
 */
export enum OpenArchiverFeature {
	AUDIT_LOG = 'audit-log',
	RETENTION_POLICY = 'retention-policy',
	SSO = 'sso',
	STATUS = 'status',
	ALL = 'all',
}

/**
 * The payload of the offline license.jwt file.
 */
export interface LicenseFilePayload {
	licenseId: string; // UUID linking to the License Server
	customerName: string;
	planSeats: number;
	features: OpenArchiverFeature[];
	expiresAt: string; // ISO 8601
	issuedAt: string; // ISO 8601
}

/**
 * The structure of the cached response from the License Server.
 */
export interface LicenseStatusPayload {
	status: 'VALID' | 'REVOKED';
	gracePeriodEnds?: string; // ISO 8601, only present if REVOKED
	/** ISO 8601 UTC timestamp of when this status was last successfully fetched. */
	lastCheckedAt?: string;
	/** The current plan seat limit from the license server. */
	planSeats?: number;
	/** ISO 8601 UTC timestamp of the license expiration date. */
	expirationDate?: string;
	/** Optional message from the license server (e.g. regarding account status). */
	message?: string;
}

/**
 * The consolidated license status object returned by the API.
 */
export interface ConsolidatedLicenseStatus {
	// From the license.jwt file
	customerName: string;
	planSeats: number;
	expiresAt: string;
	// From the cached license-status.json
	remoteStatus: 'VALID' | 'REVOKED' | 'UNKNOWN';
	gracePeriodEnds?: string;
	lastCheckedAt?: string;
	message?: string;
	// Calculated values
	activeSeats: number;
	isExpired: boolean;
	features: {
		[key in OpenArchiverFeature]?: boolean;
	};
}

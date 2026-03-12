import type { AuditProofVerificationResult, SystemSettings } from '@open-archiver/types';
import { logger } from '../config/logger';

interface AuditProofPayload {
	key: string;
	value: string;
	timestamp?: number;
}

interface AuditProofResponse {
	res: string;
	msg: string;
	log?: Record<string, { res: string; msg: string }>;
}

export interface AuditProofStoreResult extends AuditProofResponse {
	httpStatus: number;
	error?: string;
}

export class AuditProofService {
	private buildKey(instanceId: string, archivedEmailId: string): string {
		return `${instanceId}:${archivedEmailId}`;
	}

	private getInstanceId(settings: SystemSettings): string | null {
		const value = settings.auditProofInstanceId?.trim();
		return value ? value : null;
	}

	private getBaseUrl(settings: SystemSettings): string | null {
		const fromSettings = settings.auditProofInstanceServerAddr?.trim();
		if (fromSettings) {
			return fromSettings;
		}

		const fromEnv = process.env.AUDIT_PROOF_BACKEND_URL?.trim();
		return fromEnv || null;
	}

	private isEnabled(settings: SystemSettings): boolean {
		return Boolean(this.getBaseUrl(settings) && this.getInstanceId(settings));
	}

	public isConfigured(settings: SystemSettings): boolean {
		return this.isEnabled(settings);
	}

	public async saveHashForKey(
		settings: SystemSettings,
		key: string,
		hash: string
	): Promise<AuditProofStoreResult | null> {
		if (!this.isEnabled(settings)) {
			return null;
		}

		const { status, body } = await this.post(settings, '/save', { key, value: hash });

		return {
			...body,
			httpStatus: status,
		};
	}

	public async saveEmailHash(
		settings: SystemSettings,
		archivedEmailId: string,
		hash: string
	): Promise<AuditProofStoreResult | null> {
		const instanceId = this.getInstanceId(settings);
		if (!instanceId) {
			return null;
		}

		const key = this.buildKey(instanceId, archivedEmailId);
		return this.saveHashForKey(settings, key, hash);
	}

	public async verifyEmailHash(
		settings: SystemSettings,
		archivedEmailId: string,
		hash: string,
		timestamp: number
	): Promise<AuditProofVerificationResult | null> {
		if (!this.isEnabled(settings)) {
			return null;
		}

		const key = this.buildKey(this.getInstanceId(settings) as string, archivedEmailId);
		const { status, body } = await this.post(settings, '/verify', {
			key,
			value: hash,
			timestamp,
		});

		return {
			...body,
			httpStatus: status,
		};
	}

	private async post(
		settings: SystemSettings,
		endpoint: '/save' | '/verify',
		payload: AuditProofPayload
	): Promise<{ status: number; body: AuditProofResponse }> {
		const baseUrl = this.getBaseUrl(settings);
		if (!baseUrl) {
			throw new Error('Audit-proof backend URL is not configured');
		}

		if (settings.auditProofDebugRequests) {
			logger.info(
				{ endpoint, payload, target: `${baseUrl}${endpoint}` },
				'Audit-proof request payload'
			);
		}

		const response = await fetch(`${baseUrl}${endpoint}`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(payload),
		});

		let body: AuditProofResponse = {
			res: response.ok ? 'SUCCESS' : 'ERROR',
			msg: `HTTP ${response.status}`,
		};

		try {
			body = (await response.json()) as AuditProofResponse;
		} catch (error) {
			logger.warn(
				{ endpoint, status: response.status, error },
				'Could not parse audit-proof backend response as JSON'
			);
		}

		if (settings.auditProofDebugRequests) {
			logger.info(
				{ endpoint, status: response.status, response: body },
				'Audit-proof response payload'
			);
		}

		if (!response.ok && response.status !== 200 && response.status !== 503) {
			logger.warn(
				{ endpoint, status: response.status, body },
				'Audit-proof backend returned non-success status'
			);
		}

		return { status: response.status, body };
	}
}

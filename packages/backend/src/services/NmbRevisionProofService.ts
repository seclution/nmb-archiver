import type { NmbRevisionProofVerifyResult, SystemSettings } from '@open-archiver/types';
import { config } from '../config';
import { logger } from '../config/logger';

interface NmbRevisionProofPayload {
	key: string;
	value: string;
	timestamp?: number;
}

interface NmbRevisionProofResponse {
	res: string;
	msg: string;
	log?: Record<string, { res: string; msg: string }>;
}

export interface NmbRevisionProofStoreResult extends NmbRevisionProofResponse {
	httpStatus: number;
	error?: string;
}

export class NmbRevisionProofService {
	private isAbortError(error: unknown): boolean {
		return error instanceof Error && error.name === 'AbortError';
	}

	private buildKey(instanceId: string, archivedEmailId: string): string {
		return `${instanceId}:${archivedEmailId}`;
	}

	private getInstanceId(settings: SystemSettings): string | null {
		const nestedValue = settings.nmbRevisionProof.instanceId?.trim();
		return nestedValue || null;
	}

	private getBaseUrl(settings: SystemSettings): string | null {
		const nestedValue = settings.nmbRevisionProof.backendUrl?.trim();
		return nestedValue || null;
	}

	private getRequestTimeoutMs(settings: SystemSettings): number {
		const configuredTimeout = settings.nmbRevisionProof.requestTimeoutMs;
		if (Number.isFinite(configuredTimeout) && configuredTimeout > 0) {
			return configuredTimeout;
		}

		return config.app.nmbRevisionProofRequestTimeoutMs;
	}

	private shouldLogDebugRequests(settings: SystemSettings): boolean {
		return settings.nmbRevisionProof.debugRequests;
	}

	private isEnabled(settings: SystemSettings): boolean {
		return Boolean(this.getBaseUrl(settings) && this.getInstanceId(settings));
	}

	public isConfigured(settings: SystemSettings): boolean {
		return this.isEnabled(settings);
	}

	public async saveEmailHash(
		settings: SystemSettings,
		archivedEmailId: string,
		hash: string
	): Promise<NmbRevisionProofStoreResult | null> {
		const instanceId = this.getInstanceId(settings);
		if (!instanceId) {
			return null;
		}

		const key = this.buildKey(instanceId, archivedEmailId);
		const { status, body } = await this.post(settings, '/save', { key, value: hash });

		return {
			...body,
			httpStatus: status,
		};
	}

	public async verifyEmailHash(
		settings: SystemSettings,
		archivedEmailId: string,
		hash: string,
		timestamp: number
	): Promise<NmbRevisionProofVerifyResult | null> {
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
		payload: NmbRevisionProofPayload
	): Promise<{ status: number; body: NmbRevisionProofResponse }> {
		const baseUrl = this.getBaseUrl(settings);
		if (!baseUrl) {
			throw new Error('NMB revision-proof backend URL is not configured');
		}

		const timeoutMs = this.getRequestTimeoutMs(settings);
		const controller = new AbortController();
		const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

		if (this.shouldLogDebugRequests(settings)) {
			logger.info(
				{ endpoint, payload, target: `${baseUrl}${endpoint}` },
				'NMB revision-proof request payload'
			);
		}

		try {
			const response = await fetch(`${baseUrl}${endpoint}`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(payload),
				signal: controller.signal,
			});

			let body: NmbRevisionProofResponse = {
				res: response.ok ? 'SUCCESS' : 'ERROR',
				msg: `HTTP ${response.status}`,
			};

			try {
				body = (await response.json()) as NmbRevisionProofResponse;
			} catch (error) {
				if (this.isAbortError(error)) {
					throw error;
				}

				logger.warn(
					{ endpoint, status: response.status, error },
					'Could not parse NMB revision-proof backend response as JSON'
				);
			}

			if (this.shouldLogDebugRequests(settings)) {
				logger.info(
					{ endpoint, status: response.status, response: body },
					'NMB revision-proof response payload'
				);
			}

			if (!response.ok && response.status !== 200 && response.status !== 503) {
				logger.warn(
					{ endpoint, status: response.status, body },
					'NMB revision-proof backend returned non-success status'
				);
			}

			return { status: response.status, body };
		} catch (error) {
			if (this.isAbortError(error)) {
				logger.warn(
					{ endpoint, timeoutMs, target: `${baseUrl}${endpoint}` },
					'NMB revision-proof request timed out'
				);
				throw new Error(
					`NMB revision-proof request to ${endpoint} timed out after ${timeoutMs}ms`
				);
			}

			throw error;
		} finally {
			clearTimeout(timeoutHandle);
		}
	}
}

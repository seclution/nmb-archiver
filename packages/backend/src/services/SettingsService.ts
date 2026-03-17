import { db } from '../database';
import { systemSettings } from '../database/schema/system-settings';
import type { SystemSettings, User } from '@open-archiver/types';
import { AuditService } from './AuditService';

const DEFAULT_SETTINGS: SystemSettings = {
	language: 'en',
	theme: 'system',
	supportEmail: null,
	nmbRevisionProof: {
		instanceId: null,
		backendUrl: null,
		debugRequests: false,
		requestTimeoutMs: 5000,
	},
};

export class SettingsService {
	private auditService = new AuditService();
	/**
	 * Retrieves the current system settings.
	 * If no settings exist, it initializes and returns the default settings.
	 * @returns The system settings.
	 */
	public async getSystemSettings(): Promise<SystemSettings> {
		const settings = await db.select().from(systemSettings).limit(1);

		if (settings.length === 0) {
			return this.createDefaultSystemSettings();
		}

		return this.normalizeSettings(settings[0].config);
	}

	/**
	 * Updates the system settings by merging the new configuration with the existing one.
	 * @param newConfig - A partial object of the new settings configuration.
	 * @returns The updated system settings.
	 */
	public async updateSystemSettings(
		newConfig: Partial<SystemSettings>,
		actor: User,
		actorIp: string
	): Promise<SystemSettings> {
		const currentConfig = await this.getSystemSettings();
		const mergedConfig: SystemSettings = {
			...currentConfig,
			...newConfig,
			nmbRevisionProof: {
				...currentConfig.nmbRevisionProof,
				...(newConfig.nmbRevisionProof ?? {}),
			},
		};

		// Since getSettings ensures a record always exists, we can directly update.
		const [result] = await db.update(systemSettings).set({ config: mergedConfig }).returning();

		const changedFields = Object.keys(newConfig).filter(
			(key) =>
				currentConfig[key as keyof SystemSettings] !==
				newConfig[key as keyof SystemSettings]
		);

		if (changedFields.length > 0) {
			await this.auditService.createAuditLog({
				actorIdentifier: actor.id,
				actionType: 'UPDATE',
				targetType: 'SystemSettings',
				targetId: 'system',
				actorIp,
				details: {
					changedFields,
				},
			});
		}

		return this.normalizeSettings(result.config);
	}

	/**
	 * Creates and saves the default system settings.
	 * This is called internally when no settings are found.
	 * @returns The newly created default settings.
	 */
	private async createDefaultSystemSettings(): Promise<SystemSettings> {
		const [result] = await db
			.insert(systemSettings)
			.values({ config: DEFAULT_SETTINGS })
			.returning();
		return this.normalizeSettings(result.config);
	}

	private normalizeSettings(settings: SystemSettings): SystemSettings {
		return {
			...DEFAULT_SETTINGS,
			...settings,
			nmbRevisionProof: {
				...DEFAULT_SETTINGS.nmbRevisionProof,
				...(settings.nmbRevisionProof ?? {}),
			},
		};
	}
}

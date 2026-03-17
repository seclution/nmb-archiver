import { api } from '$lib/server/api';
import type { NmbRevisionProofOverview, SystemSettings } from '@open-archiver/types';
import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const response = await api('/settings/system', event);

	if (!response.ok) {
		const { message } = await response.json();
		throw error(response.status, message || 'Failed to fetch system settings');
	}

	const systemSettings: SystemSettings = await response.json();
	const overviewResponse = await api('/settings/system/nmb-revision-proof-overview', event);
	const nmbRevisionProofOverview: NmbRevisionProofOverview | null = overviewResponse.ok
		? await overviewResponse.json()
		: null;

	return {
		systemSettings,
		nmbRevisionProofOverview,
	};
};

export const actions: Actions = {
	default: async (event) => {
		const formData = await event.request.formData();
		const language = formData.get('language');
		const theme = formData.get('theme');
		const supportEmail = formData.get('supportEmail');
		const nmbRevisionProofInstanceId = formData.get('nmbRevisionProofInstanceId');
		const nmbRevisionProofBackendUrl = formData.get('nmbRevisionProofBackendUrl');
		const nmbRevisionProofDebugRequests =
			formData.get('nmbRevisionProofDebugRequests') === 'on';
		const nmbRevisionProofRequestTimeoutMs = Number(
			formData.get('nmbRevisionProofRequestTimeoutMs')
		);

		const body: Partial<SystemSettings> = {
			language: language as SystemSettings['language'],
			theme: theme as SystemSettings['theme'],
			supportEmail: supportEmail ? String(supportEmail) : null,
			nmbRevisionProof: {
				instanceId: nmbRevisionProofInstanceId ? String(nmbRevisionProofInstanceId) : null,
				backendUrl: nmbRevisionProofBackendUrl ? String(nmbRevisionProofBackendUrl) : null,
				debugRequests: nmbRevisionProofDebugRequests,
				requestTimeoutMs:
					Number.isFinite(nmbRevisionProofRequestTimeoutMs) &&
					nmbRevisionProofRequestTimeoutMs > 0
						? nmbRevisionProofRequestTimeoutMs
						: 5000,
			},
		};

		const response = await api('/settings/system', event, {
			method: 'PUT',
			body: JSON.stringify(body),
		});

		if (!response.ok) {
			const { message } = await response.json();
			return fail(response.status, { message: message || 'Failed to update settings' });
		}

		const updatedSettings: SystemSettings = await response.json();

		return {
			success: true,
			settings: updatedSettings,
		};
	},
};

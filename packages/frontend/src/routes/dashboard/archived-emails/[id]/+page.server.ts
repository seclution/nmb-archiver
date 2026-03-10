import { api } from '$lib/server/api';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { ArchivedEmail, IntegrityCheckResult } from '@open-archiver/types';

export const load: PageServerLoad = async (event) => {
	try {
		const { id } = event.params;
		const emailResponse = await api(`/archived-emails/${id}?includeVerification=true`, event);

		if (!emailResponse.ok) {
			const responseText = await emailResponse.json();
			return error(
				emailResponse.status,
				responseText.message || 'You do not have permission to read this email.'
			);
		}

		const email: ArchivedEmail = await emailResponse.json();
		const integrityReport: IntegrityCheckResult[] =
			email.verification?.localIntegrity?.integrityReport ?? [];

		return {
			email,
			integrityReport,
		};
	} catch (e) {
		console.error('Failed to load archived email:', e);
		return {
			email: null,
			integrityReport: [],
			error: 'Failed to load email',
		};
	}
};

import { db } from '../database';
import { archivedEmails } from '../database/schema';
import { eq } from 'drizzle-orm';
import type { IntegrityVerificationResponse } from '@open-archiver/types';
import { EmailVerificationService } from './EmailVerificationService';

export class IntegrityService {
	private emailVerificationService = new EmailVerificationService();

	public async checkEmailIntegrity(emailId: string): Promise<IntegrityVerificationResponse> {
		const email = await db.query.archivedEmails.findFirst({
			where: eq(archivedEmails.id, emailId),
		});

		if (!email) {
			throw new Error('Archived email not found');
		}

		const verification = await this.emailVerificationService.verifyEmail(email, {
			includeAuditProof: true,
		});

		return {
			localIntegrity: verification.localIntegrity,
			externalProof: verification.externalProof,
		};
	}
}

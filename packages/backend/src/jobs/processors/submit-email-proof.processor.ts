import { Job } from 'bullmq';
import {
	AuditProofEmailSubmissionService,
	type SubmitEmailProofJobData,
} from '../../services/AuditProofEmailSubmissionService';

const auditProofEmailSubmissionService = new AuditProofEmailSubmissionService();

export default async (job: Job<SubmitEmailProofJobData>) => {
	await auditProofEmailSubmissionService.processEmailSubmission(job.data.archivedEmailId);
};

import { Job } from 'bullmq';
import {
	NmbRevisionProofSubmissionService,
	type SubmitNmbRevisionProofJobData,
} from '../../services/NmbRevisionProofSubmissionService';

const nmbRevisionProofSubmissionService = new NmbRevisionProofSubmissionService();

export default async (job: Job<SubmitNmbRevisionProofJobData>) => {
	await nmbRevisionProofSubmissionService.processEmailSubmission(job.data.archivedEmailId);
};

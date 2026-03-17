import { Queue, FlowProducer } from 'bullmq';
import { connection } from '../config/redis';

export const flowProducer = new FlowProducer({ connection });

// Default job options
const defaultJobOptions = {
	attempts: 5,
	backoff: {
		type: 'exponential',
		delay: 1000,
	},
	removeOnComplete: {
		count: 1000,
	},
	removeOnFail: {
		count: 5000,
	},
};

export const ingestionQueue = new Queue('ingestion', {
	connection,
	defaultJobOptions,
});

export const indexingQueue = new Queue('indexing', {
	connection,
	defaultJobOptions,
});

export const nmbRevisionProofQueue = new Queue('nmb-revision-proof', {
	connection,
	defaultJobOptions,
});

// backend/config/queue.js
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import logger from './logger.js';

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

// Setup connection options for ioredis
const connectionOptions = {
    maxRetriesPerRequest: null,
};

let redisConnection;

try {
    redisConnection = new IORedis(redisUrl, connectionOptions);

    redisConnection.on('connect', () => {
        logger.info('✅ Redis Connected for BullMQ');
    });

    redisConnection.on('error', (err) => {
        logger.error('❌ Redis Connection Error:', err);
    });
} catch (err) {
    logger.error('❌ Failed to initialize Redis connection:', err);
}

export const documentQueue = new Queue('document-queue', {
    connection: redisConnection,
});

export { redisConnection };

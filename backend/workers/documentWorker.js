// backend/workers/documentWorker.js
import { Worker } from 'bullmq';
import fs from 'fs/promises';
import { ObjectId } from 'mongodb';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { client } from '../config/db.js';
import logger from '../config/logger.js';
import { redisConnection } from '../config/queue.js';

const worker = new Worker('document-queue', async (job) => {
    const { filePath, filename, userId, jobDbId } = job.data;
    const jobsCollection = client.db('rag_db').collection('document_jobs');
    const vectorStoreCollection = client.db('rag_db').collection('vector_store');

    logger.info(`[Worker] Starting job ${job.id} for file: ${filename}, user: ${userId}`);

    // Update job status to processing in DB
    await jobsCollection.updateOne(
        { _id: new ObjectId(jobDbId) },
        { $set: { status: 'processing', updatedAt: new Date() } }
    );

    try {
        // 1. Load document using LangChain PDFLoader
        const loader = new PDFLoader(filePath);
        const docs = await loader.load();
        
        // 2. Split documents into chunks
        const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 200 });
        const chunks = await splitter.splitDocuments(docs);
        
        logger.info(`[Worker] Document parsed. Created ${chunks.length} chunks.`);

        // 3. Setup LangChain Google Embeddings (automatically integrates with LangSmith if variables exist)
        const embeddingsInstance = new GoogleGenerativeAIEmbeddings({
            apiKey: process.env.GOOGLE_API_KEY,
            model: process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001",
        });

        const textsToEmbed = chunks.map(c => c.pageContent);
        const batchSize = 100;
        const allVectors = [];

        // 4. Batch embedding requests and apply retry logic with exponential backoff
        for (let i = 0; i < textsToEmbed.length; i += batchSize) {
            const batch = textsToEmbed.slice(i, i + batchSize);
            let attempt = 0;
            const maxRetries = 5;
            const initialDelay = 1000;
            let success = false;
            let batchVectors;

            while (!success && attempt < maxRetries) {
                try {
                    batchVectors = await embeddingsInstance.embedDocuments(batch);
                    success = true;
                } catch (err) {
                    attempt++;
                    const isRateLimit = err.status === 429 || 
                                        err.message?.includes('429') || 
                                        err.message?.includes('RESOURCE_EXHAUSTED') ||
                                        err.message?.includes('Rate limit');

                    if (isRateLimit && attempt < maxRetries) {
                        const delay = initialDelay * Math.pow(2, attempt) + Math.random() * 1000;
                        logger.warn(`[Worker] Rate limit hit. Retrying batch starting at index ${i} (attempt ${attempt}/${maxRetries}) in ${delay.toFixed(0)}ms...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    } else {
                        logger.error(`[Worker] Failed to embed batch starting at index ${i}:`, err);
                        throw err; // bubble up error
                    }
                }
            }

            allVectors.push(...batchVectors);

            // Throttle between batches to prevent triggering rate limits
            if (i + batchSize < textsToEmbed.length) {
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }

        // 5. Save vectors to MongoDB with source & user metadata
        const newVectors = allVectors.map((vector, index) => ({
            text: chunks[index].pageContent,
            vector: vector,
            metadata: {
                source: filename,
                userId: userId,
                uploadedAt: new Date()
            }
        }));

        await vectorStoreCollection.insertMany(newVectors);
        logger.info(`[Worker] Saved ${newVectors.length} vectors to MongoDB.`);

        // 6. Update job status to completed in DB
        await jobsCollection.updateOne(
            { _id: new ObjectId(jobDbId) },
            { $set: { status: 'completed', updatedAt: new Date() } }
        );

    } catch (err) {
        logger.error(`[Worker] Job ${job.id} failed:`, err);
        await jobsCollection.updateOne(
            { _id: new ObjectId(jobDbId) },
            { $set: { status: 'failed', error: err.message, updatedAt: new Date() } }
        );
        throw err;
    } finally {
        // 7. Clean up the temp file asynchronously
        try {
            await fs.unlink(filePath);
            logger.info(`[Worker] Deleted temporary file at ${filePath}`);
        } catch (unlinkErr) {
            logger.error(`[Worker] Failed to delete temporary file at ${filePath}:`, unlinkErr);
        }
    }
}, {
    connection: redisConnection,
    concurrency: 2 // Allow 2 documents to process concurrently
});

worker.on('failed', (job, err) => {
    logger.error(`[Worker] Job ${job?.id} failed definitely: ${err.message}`);
});

logger.info('⚙️ BullMQ Worker initialized successfully');

export default worker;

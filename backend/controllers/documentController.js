// backend/controllers/documentController.js
import fs from 'fs/promises';
import { client } from '../config/db.js';
import { documentQueue } from '../config/queue.js';
import logger from '../config/logger.js';
import asyncHandler from '../middleware/asyncHandler.js';

const processDocument = asyncHandler(async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No PDF uploaded" });
    }
    const userId = req.user.userId;
    const filename = req.file.originalname;

    const vectorCollection = client.db('rag_db').collection('vector_store');
    const jobsCollection = client.db('rag_db').collection('document_jobs');

    // 1. Check for duplicates in completed vectors
    const existingDoc = await vectorCollection.findOne({
        "metadata.source": filename,
        "metadata.userId": userId
    });

    if (existingDoc) {
        await fs.unlink(req.file.path);
        logger.info(`Upload rejected: File already processed: ${filename} for user: ${userId}`);
        return res.status(400).json({ error: "Document already exists in your knowledge base." });
    }

    // 2. Check if a job is already pending or processing for this file
    const existingJob = await jobsCollection.findOne({
        filename: filename,
        userId: userId,
        status: { $in: ['pending', 'processing'] }
    });

    if (existingJob) {
        await fs.unlink(req.file.path);
        logger.info(`Upload rejected: File is already processing: ${filename} for user: ${userId}`);
        return res.status(400).json({ error: "This document is already being processed." });
    }

    // 3. Create a pending job in MongoDB
    const jobDoc = {
        userId,
        filename,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date()
    };
    
    const result = await jobsCollection.insertOne(jobDoc);
    const jobDbId = result.insertedId.toString();

    // 4. Enqueue to BullMQ
    const queueJob = await documentQueue.add('process-pdf', {
        filePath: req.file.path,
        filename,
        userId,
        jobDbId
    });

    logger.info(`Enqueued PDF job in BullMQ: JobId=${queueJob.id}, DbId=${jobDbId}`);

    res.json({
        message: "Document uploaded and queued for processing.",
        jobId: jobDbId,
        status: "pending"
    });
});

const getDocuments = asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const collection = client.db('rag_db').collection('vector_store');

    // Find unique documents for THIS user only
    const docs = await collection.distinct("metadata.source", { "metadata.userId": userId });
    res.json(docs);
});

const deleteDocument = asyncHandler(async (req, res) => {
    const filename = req.params.filename;
    const userId = req.user.userId;
    
    const vectorCollection = client.db('rag_db').collection('vector_store');
    const jobsCollection = client.db('rag_db').collection('document_jobs');

    // Delete vectors matching filename and user
    const vectorResult = await vectorCollection.deleteMany({
        "metadata.source": filename,
        "metadata.userId": userId
    });

    // Also delete jobs for this file
    const jobResult = await jobsCollection.deleteMany({
        filename: filename,
        userId: userId
    });

    logger.info(`Deleted document ${filename} for user ${userId}. Vectors removed: ${vectorResult.deletedCount}, Jobs removed: ${jobResult.deletedCount}`);

    res.json({ message: "Document forgotten" });
});

// New controller to poll processing jobs status
const getJobs = asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const jobsCollection = client.db('rag_db').collection('document_jobs');

    // Fetch jobs for this user
    const jobs = await jobsCollection.find({ userId })
        .sort({ createdAt: -1 })
        .toArray();

    res.json(jobs);
});

export { processDocument, getDocuments, deleteDocument, getJobs };
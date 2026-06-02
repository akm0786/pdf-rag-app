// backend/index.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { connectDB } from './config/db.js'; // Notice the .js!
import logger from './config/logger.js';
import errorHandler from './middleware/errorHandler.js';
import './workers/documentWorker.js';

// Handle uncaught exceptions and rejections
process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception:', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Import Routes
import authRoutes from './routes/authRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import documentRoutes from './routes/documentRoutes.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({ origin: process.env.FRONTEND_URL || "*" }));
// Request size validation: restrict JSON body to 50KB to protect against DOS
app.use(express.json({ limit: '50kb' }));

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/docs', documentRoutes);

// Centralized error handling middleware (must be registered last)
app.use(errorHandler);

// Initialize App
const startServer = async () => {
    await connectDB();
    app.listen(PORT, '0.0.0.0', () => {
        logger.info(`🚀 Neural API running on port ${PORT}`);
    });
};

startServer();
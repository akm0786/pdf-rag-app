// backend/middleware/errorHandler.js
import logger from '../config/logger.js';

const errorHandler = (err, req, res, next) => {
    // Log the full stack trace of the error
    logger.error(`${err.message} - ${req.originalUrl} - ${req.method} - ${req.ip}`, err);

    // Standardize error status code
    const statusCode = err.status || err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    res.status(statusCode).json({
        error: message,
        stack: process.env.NODE_ENV === 'production' ? '🥞' : err.stack
    });
};

export default errorHandler;

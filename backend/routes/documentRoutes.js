// backend/routes/documentRoutes.js
import express from 'express';
const router = express.Router();
import multer from 'multer';
import authenticateToken from '../middleware/auth.js';
import { processDocument, getDocuments, deleteDocument, getJobs } from '../controllers/documentController.js';

const upload = multer({
    dest: 'uploads/',
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
}); // Temp storage for PDF parsing

const uploadSingle = (req, res, next) => {
    upload.single('pdf')(req, res, (err) => {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ error: "File size exceeds the 5MB limit." });
            }
            return res.status(400).json({ error: err.message });
        }
        next();
    });
};

// Apply auth middleware to ALL document routes
router.use(authenticateToken);

router.post('/process', uploadSingle, processDocument);
router.get('/jobs', getJobs);
router.get('/', getDocuments);
router.delete('/:filename', deleteDocument);

export default router;
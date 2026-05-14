// backend/routes/documentRoutes.js
import express from 'express';
const router = express.Router();
import multer from 'multer';
import authenticateToken from '../middleware/auth.js';
import { processDocument, getDocuments, deleteDocument } from '../controllers/documentController.js';

const upload = multer({ dest: 'uploads/' }); // Temp storage for PDF parsing

// Apply auth middleware to ALL document routes
router.use(authenticateToken);

router.post('/process', upload.single('pdf'), processDocument);
router.get('/', getDocuments);
router.delete('/:filename', deleteDocument);

export default router;
// backend/routes/chatRoutes.js
import express from 'express';
const router = express.Router();
import authenticateToken from '../middleware/auth.js';
import { askQuestion, getHistory } from '../controllers/chatController.js';

router.use(authenticateToken);

router.post('/ask', askQuestion);
router.get('/history', getHistory);

export default router;
// backend/routes/authRoutes.js
import express from 'express';
const router = express.Router();
import { register, login, googleLogin, refresh, logout } from '../controllers/authController.js';

router.post('/register', register);
router.post('/login', login);
router.post('/google-login', googleLogin);
router.post('/refresh', refresh);
router.post('/logout', logout);

export default router;
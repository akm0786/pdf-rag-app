// backend/controllers/authController.js
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { client } from '../config/db.js';
import logger from '../config/logger.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { OAuth2Client } from 'google-auth-library';

const client_oauth = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Helper function to generate access and refresh tokens
const generateTokens = async (userId, email) => {
    const accessToken = jwt.sign(
        { userId, email },
        process.env.JWT_SECRET,
        { expiresIn: '15m' } // 15 minutes short-lived
    );

    const refreshToken = jwt.sign(
        { userId, email },
        process.env.JWT_REFRESH_SECRET || 'fallback_refresh_secret',
        { expiresIn: '7d' } // 7 days long-lived
    );

    // Save refresh token to MongoDB
    const refreshTokensCollection = client.db('rag_db').collection('refresh_tokens');
    await refreshTokensCollection.insertOne({
        token: refreshToken,
        userId,
        createdAt: new Date()
    });

    return { accessToken, refreshToken };
};

// Registration Logic
const register = asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
    }

    const usersCollection = client.db('rag_db').collection('users');

    // Check if user exists
    const existingUser = await usersCollection.findOne({ email });
    if (existingUser) {
        return res.status(400).json({ error: "User already exists" });
    }

    // Hash password and save
    const hashedPassword = await bcrypt.hash(password, 10);
    await usersCollection.insertOne({ email, password: hashedPassword });

    logger.info(`User registered successfully: ${email}`);
    res.status(201).json({ message: "User created successfully" });
});

// Login Logic
const login = asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
    }

    const usersCollection = client.db('rag_db').collection('users');
    const user = await usersCollection.findOne({ email });

    logger.info(`Login attempt for: ${email}`);
    if (!user) {
        logger.info(`User not found: ${email}`);
        return res.status(400).json({ error: "Invalid credentials" });
    }

    // Check if password match (only if local account, else user might be Google-only)
    if (!user.password) {
        return res.status(400).json({ error: "Invalid credentials. Please log in with Google." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    logger.info(`Password match for ${email}: ${isMatch}`);
    if (!isMatch) {
        return res.status(400).json({ error: "Invalid credentials" });
    }

    // Generate both Access and Refresh Tokens
    const { accessToken, refreshToken } = await generateTokens(user._id.toString(), user.email);

    res.json({ token: accessToken, refreshToken, email: user.email });
});

// Google Login Logic
const googleLogin = asyncHandler(async (req, res) => {
    const { idToken } = req.body;
    if (!idToken) {
        return res.status(400).json({ error: "ID Token is required" });
    }

    const ticket = await client_oauth.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { email, sub: googleId } = payload;

    const usersCollection = client.db('rag_db').collection('users');
    let user = await usersCollection.findOne({ email });

    if (!user) {
        // New user from Google
        const newUser = { email, googleId, createdAt: new Date() };
        const result = await usersCollection.insertOne(newUser);
        user = { ...newUser, _id: result.insertedId };
        logger.info(`New user registered via Google: ${email}`);
    } else if (!user.googleId) {
        // Link Google ID to existing email user
        await usersCollection.updateOne({ email }, { $set: { googleId } });
        logger.info(`Linked Google account to existing user: ${email}`);
    }

    // Generate Access and Refresh Tokens
    const { accessToken, refreshToken } = await generateTokens(user._id.toString(), user.email);

    res.json({ token: accessToken, refreshToken, email: user.email });
});

// Refresh Token Logic
const refresh = asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) {
        return res.status(400).json({ error: "Refresh token is required" });
    }

    const refreshTokensCollection = client.db('rag_db').collection('refresh_tokens');
    const storedToken = await refreshTokensCollection.findOne({ token: refreshToken });

    if (!storedToken) {
        logger.warn(`Refresh token not found in database: ${refreshToken.substring(0, 10)}...`);
        return res.status(403).json({ error: "Invalid Refresh Token" });
    }

    try {
        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || 'fallback_refresh_secret');
        
        // Generate new Access Token
        const accessToken = jwt.sign(
            { userId: decoded.userId, email: decoded.email },
            process.env.JWT_SECRET,
            { expiresIn: '15m' }
        );

        res.json({ token: accessToken });
    } catch (err) {
        logger.error(`Refresh token verification failed: ${err.message}`);
        // Remove stale/expired refresh token from database
        await refreshTokensCollection.deleteOne({ token: refreshToken });
        return res.status(403).json({ error: "Invalid or Expired Refresh Token" });
    }
});

// Logout Logic
const logout = asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    if (refreshToken) {
        const refreshTokensCollection = client.db('rag_db').collection('refresh_tokens');
        const result = await refreshTokensCollection.deleteOne({ token: refreshToken });
        logger.info(`Logout: deleted refresh token. Matches: ${result.deletedCount}`);
    }
    res.json({ message: "Logged out successfully" });
});

export { login, register, googleLogin, refresh, logout };
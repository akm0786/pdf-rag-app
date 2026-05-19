// backend/controllers/authController.js
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { client } from '../config/db.js';

// Registration Logic
const register = async (req, res) => {
    try {
        const { email, password } = req.body;
        const usersCollection = client.db('rag_db').collection('users');

        // Check if user exists
        const existingUser = await usersCollection.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: "User already exists" });
        }

        // Hash password and save
        const hashedPassword = await bcrypt.hash(password, 10);
        await usersCollection.insertOne({ email, password: hashedPassword });

        res.status(201).json({ message: "User created successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Registration failed" });
    }
};

// Login Logic
const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const usersCollection = client.db('rag_db').collection('users');

        const user = await usersCollection.findOne({ email });
        console.log(`Login attempt for: ${email}`);
        if (!user) {
            console.log("User not found");
            return res.status(400).json({ error: "Invalid credentials" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        console.log(`Password match: ${isMatch}`);
        if (!isMatch) {
            return res.status(400).json({ error: "Invalid credentials" });
        }

        // Generate Token
        const token = jwt.sign(
            { userId: user._id.toString(), email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        res.json({ token, email: user.email });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Login failed" });
    }
};

import { OAuth2Client } from 'google-auth-library';

const client_oauth = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const googleLogin = async (req, res) => {
    try {
        const { idToken } = req.body;
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
        }

        const token = jwt.sign(
            { userId: user._id.toString(), email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '12h' }
        );

        res.json({ token, email: user.email });
    } catch (err) {
        console.error("Google Login Error:", err);
        res.status(500).json({ error: "Google authentication failed" });
    }
};

export { login, register, googleLogin };
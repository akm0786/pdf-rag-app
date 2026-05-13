import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { MongoClient } from 'mongodb'; // NEW: MongoDB Driver
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

dotenv.config();
const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || "*", // Allow all for now, or specific URL later
  methods: ["GET", "POST", "DELETE"]
}));

app.use(express.json());


const upload = multer({ dest: 'uploads/' });

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-2" });

// --- MONGODB SETUP ---
const client = new MongoClient(process.env.MONGO_URI);
let collection; // For vectors
let historyCollection; // NEW: For chat history
let usersCollection; // NEW: For user credentials

async function connectDB() {
    try {
        await client.connect();
        const db = client.db('pdf_rag');
        collection = db.collection('documents');
        historyCollection = db.collection('history');
        usersCollection = db.collection('users'); // Initialize users collection

        // Create a unique index for email to prevent duplicate signups
        await usersCollection.createIndex({ email: 1 }, { unique: true });

        console.log("✅ Connected to MongoDB Atlas!");
    } catch (err) {
        console.error("❌ MongoDB Connection Error:", err);
    }
}
connectDB();

// -- AUTH: Register a new User ---

app.post("/register", async (req, res) => {
    try {
        const { email, password } = req.body;

        // hash the passoword before saving
        const hashedPassword = await bcrypt.hash(password, 10);

        await usersCollection.insertOne({ email, password: hashedPassword, createdAt: new Date() });

        res.status(201).json({ message: "User registered successfully" });
    } catch (err) {
        if (err.code === 11000) {
            res.status(400).json({ message: "User already exists" });
        } else {
            res.status(500).json({ error: err.message });
        }
    }
})

// --- AUTH: Login User & Generate Token ---

app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await usersCollection.findOne({ email });

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        // generate a JWT containing the User ID
        const token = jwt.sign(
            { userId: user._id, email: user.email },
            process.env.JWT_SECRET || "secret1212",
            { expiresIn: "24h" }
        )
        res.json({ token, email: user.email });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
})

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) return res.status(401).json({ error: "Access denied. No token provided." });

    jwt.verify(token, process.env.JWT_SECRET || "secret1212", (err, user) => {
        if (err) return res.status(403).json({ error: "Invalid token." });
        req.user = user; // Add user info (userId) to the request object
        next();
    })

}

// --- STEP 1: Process & Save to MongoDB ---
app.post('/process', authenticateToken, upload.single('pdf'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No file uploaded" });

        // 1. Check if we already processed this PDF (No more duplicates!)
        const existingDoc = await collection.findOne({ source: req.file.originalname });
        if (existingDoc) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ error: "Document already exists in the knowledge base." });
        }

        const loader = new PDFLoader(req.file.path);
        const docs = await loader.load();
        const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 200 });
        const chunks = await splitter.splitDocuments(docs);

        console.log(`Processing ${chunks.length} chunks from ${req.file.originalname}...`);

        const requests = chunks.map(chunk => ({
            content: { role: "user", parts: [{ text: chunk.pageContent }] }
        }));

        const batchResponse = await embeddingModel.batchEmbedContents({ requests });

        // Format data for MongoDB
        const newVectors = batchResponse.embeddings.map((emb, index) => ({
            text: chunks[index].pageContent,
            vector: emb.values,
            source: req.file.originalname,
            userId: req.user.userId, // 👈 Link to the logged-in user
            uploadedAt: new Date() // Good practice for real apps
        }));

        // 2. Insert into MongoDB instead of a local JSON file
        await collection.insertMany(newVectors);
        console.log("✅ Saved to MongoDB successfully.");

        fs.unlinkSync(req.file.path); // Clean up temp file

        res.json({ message: `Successfully trained on ${req.file.originalname}!` });
    } catch (err) {
        console.error("Batch Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// --- STEP 2: Ask using Atlas Vector Search (Stable JSON Version) ---
app.post('/ask', authenticateToken, async (req, res) => {
    try {
        const { question } = req.body;

        // 1. Generate embedding for the user's question
        const qEmbedding = await embeddingModel.embedContent(question);
        const qVector = qEmbedding.embedding.values;

        // 2. MongoDB Vector Search Pipeline
        const pipeline = [
            {
                "$vectorSearch": {
                    "index": "vector_index",
                    "path": "vector",
                    "queryVector": qVector,
                    "numCandidates": 100,
                    "limit": 5,
                    "filter": { "userId": { "$eq": req.user.userId } }
                }
            },
            {
                "$project": {
                    "_id": 0,
                    "text": 1,
                    "source": 1,
                    "score": { "$meta": "vectorSearchScore" }
                }
            }
        ];

        const sorted = await collection.aggregate(pipeline).toArray();

        if (sorted.length === 0) {
            return res.json({
                answer: "I couldn't find relevant context in the uploaded documents.",
                sources: []
            });
        }

        const sourceDocs = [...new Set(sorted.map(s => s.source))];
        const contextChunks = sorted.map(s => ({
            text: s.text,
            source: s.source
        }));

        // 3. Construct Prompt with Context
        const context = sorted.map(r => r.text).join("\n\n");
        const prompt = `Use the provided context to answer the question. \n\nContext: ${context} \n\nQuestion: ${question}`;

        // 4. Generate Content (Non-Streaming)
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const answerText = response.text();
        // const sourceDocs = [...new Set(sorted.map(s => s.source))];

        // 5. Save to History
        await historyCollection.insertMany([
            {
                userId: req.user.userId,
                role: 'user',
                text: question,
                contextChunks: contextChunks,
                timestamp: new Date()
            },
            {
                userId: req.user.userId,
                role: 'ai',
                text: answerText,
                sources: sourceDocs,
                timestamp: new Date()
            }
        ]);

        // 6. Send simple JSON response
        res.json({
            answer: answerText,
            sources: sourceDocs,
            contextChunks: contextChunks
        });

    } catch (err) {
        console.error("Search Error:", err);
        res.status(500).json({ error: "An error occurred while processing your request." });
    }
});

// --- GET: List all unique documents in the database ---
app.get('/documents', authenticateToken, async (req, res) => {
    try {
        // Add the filter object as the second argument
        const uniqueDocs = await collection.distinct("source", { userId: req.user.userId });
        res.json(uniqueDocs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- DELETE: Remove a specific document from the knowledge base ---
app.delete('/documents/:filename', authenticateToken, async (req, res) => {
    try {
        const { filename } = req.params;
        // Ensure we only delete chunks belonging to THIS user
        await collection.deleteMany({ source: filename, userId: req.user.userId });
        res.json({ message: "Deleted" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/history', authenticateToken, async (req, res) => {
    try {
        // We MUST filter by the userId from the token
        const history = await historyCollection
            .find({ userId: req.user.userId })
            .sort({ timestamp: 1 })
            .toArray();

        res.json(history);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
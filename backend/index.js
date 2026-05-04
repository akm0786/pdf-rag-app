import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { MongoClient } from 'mongodb'; // NEW: MongoDB Driver

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: 'uploads/' });

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-2" });

// --- MONGODB SETUP ---
const client = new MongoClient(process.env.MONGO_URI);
let collection; // For vectors
let historyCollection; // NEW: For chat history

async function connectDB() {
    try {
        await client.connect();
        const db = client.db('pdf_rag');
        collection = db.collection('documents');
        historyCollection = db.collection('history'); // Initialize it
        console.log("✅ Connected to MongoDB Atlas!");
    } catch (err) {
        console.error("❌ MongoDB Connection Error:", err);
    }
}
connectDB();

// --- STEP 1: Process & Save to MongoDB ---
app.post('/process', upload.single('pdf'), async (req, res) => {
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
app.post('/ask', async (req, res) => {
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
                    "limit": 3
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

        // 3. Construct Prompt with Context
        const context = sorted.map(r => r.text).join("\n\n");
        const prompt = `Use the provided context to answer the question. \n\nContext: ${context} \n\nQuestion: ${question}`;

        // 4. Generate Content (Non-Streaming)
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const answerText = response.text();
        const sourceDocs = [...new Set(sorted.map(s => s.source))];

        // 5. Save to History
        await historyCollection.insertMany([
            { role: 'user', text: question, timestamp: new Date() },
            { role: 'ai', text: answerText, sources: sourceDocs, timestamp: new Date() }
        ]);

        // 6. Send simple JSON response
        res.json({
            answer: answerText,
            sources: sourceDocs
        });

    } catch (err) {
        console.error("Search Error:", err);
        res.status(500).json({ error: "An error occurred while processing your request." });
    }
});

// --- GET: List all unique documents in the database ---
app.get('/documents', async (req, res) => {
    try {
        // MongoDB's .distinct() efficiently grabs just the unique filenames
        const uniqueDocs = await collection.distinct("source");
        res.json(uniqueDocs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- DELETE: Remove a specific document from the knowledge base ---
app.delete('/documents/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        // Delete all vector chunks that belong to this specific PDF
        const result = await collection.deleteMany({ source: filename });

        if (result.deletedCount === 0) {
            return res.status(404).json({ error: "Document not found." });
        }

        res.json({ message: `Successfully forgot ${filename}` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/history', async (req, res) => {
    try {
        // Fetch all messages, sorted by oldest to newest
        const history = await historyCollection.find({}).sort({ timestamp: 1 }).toArray();
        res.json(history);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(3000, () => console.log("🚀 Server running on http://localhost:3000"));
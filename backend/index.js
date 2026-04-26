import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs'; // For persistence
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();
const app = express();
app.use(express.json());
app.use(cors());

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-2" });

const upload = multer({ dest: 'uploads/' });
const DB_PATH = './data/vector_db.json';
let vectorDatabase = [];

// Load existing data on startup
if (fs.existsSync(DB_PATH)) {
    vectorDatabase = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    console.log("✅ Loaded existing vectors from disk.");
}

// --- MATH: Cosine Similarity ---
function cosineSimilarity(vecA, vecB) {
    let dotProduct = 0, mA = 0, mB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        mA += vecA[i] * vecA[i];
        mB += vecB[i] * vecB[i];
    }
    return dotProduct / (Math.sqrt(mA) * Math.sqrt(mB));
}

// --- STEP 1: Process & PERSIST ---
app.post('/process', upload.single('pdf'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No file uploaded" });

        // 1. Load the PDF
        const loader = new PDFLoader(req.file.path);
        const docs = await loader.load();
        const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 200 });
        const chunks = await splitter.splitDocuments(docs);

        console.log(`Processing ${chunks.length} chunks...`);

        const requests = chunks.map(chunk => ({
            content: { role: "user", parts: [{ text: chunk.pageContent }] }
        }));

        const batchResponse = await embeddingModel.batchEmbedContents({ requests });

        const newVectors = batchResponse.embeddings.map((emb, index) => ({
            text: chunks[index].pageContent,
            vector: emb.values,
            source: req.file.originalname // Pro-tip: Keep track of which PDF this came from!
        }));

        // --- THE LOGIC CHANGE: APPENDING ---
        // 1. Get existing data from the global variable (which was loaded on startup)
        // 2. Add the new vectors to it
        vectorDatabase = [...vectorDatabase, ...newVectors];

        // 3. Save the combined list back to disk
        fs.writeFileSync(DB_PATH, JSON.stringify(vectorDatabase));

        // Cleanup: Delete the raw PDF from 'uploads' folder to save space
        fs.unlinkSync(req.file.path);

        res.json({ message: `Successfully added ${req.file.originalname} to your knowledge base!` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- STEP 2: Ask (No changes needed, but now it works even after restart!) ---
app.post('/ask', async (req, res) => {
    try {
        const { question } = req.body;
        if (vectorDatabase.length === 0) return res.status(400).json({ error: "Please process a PDF first!" });

        const qEmbedding = await embeddingModel.embedContent(question);
        const qVector = qEmbedding.embedding.values;

        const sorted = vectorDatabase
            .map(item => ({ text: item.text, score: cosineSimilarity(qVector, item.vector) }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 3);

        const context = sorted.map(r => r.text).join("\n\n");
        const prompt = `Use the context to answer. Context: ${context} \nQuestion: ${question}`;

        const result = await model.generateContent(prompt);
        const response = await result.response;

        res.json({ answer: response.text(), sources: sorted.map(s => s.text.substring(0, 50)) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(3000, () => console.log("🚀 Server running on http://localhost:3000"));
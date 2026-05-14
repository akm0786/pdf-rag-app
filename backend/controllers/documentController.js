// backend/controllers/documentController.js
import fs from 'fs';
import { client } from '../config/db.js';

// ⚠️ MAKE SURE TO IMPORT THESE FROM YOUR OLD FILE:
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
// import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { GoogleGenerativeAI } from "@google/generative-ai";
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });


const processDocument = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No PDF uploaded" });
        const userId = req.user.userId;

        // 1. Define the collection HERE
        const collection = client.db('rag_db').collection('vector_store');

        // 2. Multi-tenant duplicate check (Check filename AND userId)
        const existingDoc = await collection.findOne({
            "metadata.source": req.file.originalname,
            "metadata.userId": userId
        });

        if (existingDoc) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ error: "Document already exists in your knowledge base." });
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

        // 3. Fix the MongoDB payload to use the `metadata` object
        const newVectors = batchResponse.embeddings.map((emb, index) => ({
            text: chunks[index].pageContent,
            vector: emb.values,
            metadata: {
                source: req.file.originalname,
                userId: req.user.userId,
                uploadedAt: new Date()
            }
        }));

        await collection.insertMany(newVectors);
        console.log("✅ Saved to MongoDB successfully.");

        fs.unlinkSync(req.file.path);

        res.json({ message: "Document processed and memorized successfully" });
    } catch (err) {
        console.error(err);
        // Add a safety cleanup just in case processing fails halfway
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ error: "Failed to process document" });
    }
};

const getDocuments = async (req, res) => {
    try {
        const userId = req.user.userId;
        const collection = client.db('rag_db').collection('vector_store');

        // Find unique documents for THIS user only
        const docs = await collection.distinct("metadata.source", { "metadata.userId": userId });
        res.json(docs);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch documents" });
    }
};

const deleteDocument = async (req, res) => {
    try {
        const filename = req.params.filename;
        const userId = req.user.userId;
        const collection = client.db('rag_db').collection('vector_store');

        // Delete ONLY if it matches the filename AND the userId
        await collection.deleteMany({
            "metadata.source": filename,
            "metadata.userId": userId
        });

        res.json({ message: "Document forgotten" });
    } catch (err) {
        res.status(500).json({ error: "Failed to delete document" });
    }
};

export { processDocument, getDocuments, deleteDocument };
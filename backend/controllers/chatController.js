import { client } from '../config/db.js';
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
const historyCollection = client.db("rag_db").collection("history");
const usersCollection = client.db("rag_db").collection("users");

const askQuestion = async (req, res) => {
    try {
        const { question } = req.body;
        const collection = client.db("rag_db").collection("vector_store");

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
                    "filter": { "metadata.userId": { "$eq": req.user.userId } }
                }
            },
            {
                "$project": {
                    "_id": 0,
                    "text": 1,
                    "source": "$metadata.source",
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
                timestamp: new Date()
            },
            {
                userId: req.user.userId,
                role: 'ai',
                text: answerText,
                sources: sourceDocs,
                contextChunks: contextChunks,
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

}

const getHistory = async (req, res) => {
    try {
        const userId = req.user.userId;
        const historyCollection = client.db('rag_db').collection('history');

        const history = await historyCollection
            .find({ userId: userId })
            .sort({ timestamp: 1 })
            .toArray();

        res.json(history);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch history" });
    }
};

export { askQuestion, getHistory };
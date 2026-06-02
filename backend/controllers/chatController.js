// backend/controllers/chatController.js
import { client } from '../config/db.js';
import { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import logger from '../config/logger.js';
import asyncHandler from '../middleware/asyncHandler.js';

// Setup models using LangChain wrappers (for automatic LangSmith tracing compatibility)
const getEmbeddingModel = () => {
    return new GoogleGenerativeAIEmbeddings({
        apiKey: process.env.GOOGLE_API_KEY,
        model: process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001"
    });
};

const getChatModel = () => {
    return new ChatGoogleGenerativeAI({
        apiKey: process.env.GOOGLE_API_KEY,
        model: process.env.GEMINI_CHAT_MODEL || "gemini-3-flash-preview",

        temperature: 0.2 // Lower temperature for precision in RAG
    });
};

const systemInstruction = `You are Neural PDF, a precise and professional AI assistant. 
Your goal is to answer the user's question using ONLY the provided text Context.

Follow these rules strictly:
1. Grounding: Answer the question ONLY from the provided Context. If the context does not contain the answer, state: "I don't know" or "The provided documents do not contain this information." Do not extrapolate or use external knowledge.
2. Truthfulness: Never make up facts or hallucinate.
3. Citation: Reference facts based on the Context documents. Simply write a synthesis of the facts without referencing chunk numbers.
4. Formatting: Keep responses concise, well-structured, and formatted with Markdown.`;

const askQuestion = asyncHandler(async (req, res, next) => {
    const { question } = req.body;
    if (!question) {
        return res.status(400).json({ error: "Question is required" });
    }

    const collection = client.db("rag_db").collection("vector_store");
    const historyCollection = client.db("rag_db").collection("history");

    // 1. Generate embedding for the question
    const embeddingModel = getEmbeddingModel();
    const qVector = await embeddingModel.embedQuery(question);

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
            sources: [],
            contextChunks: []
        });
    }

    const sourceDocs = [...new Set(sorted.map(s => s.source))];
    const contextChunks = sorted.map(s => ({
        text: s.text,
        source: s.source
    }));

    // 3. Prepend source metadata to each chunk before joining with \n\n
    const context = sorted.map(r => `[Source Document: ${r.source}]\n${r.text}`).join("\n\n");

    // 4. Construct messages for LangChain Chat Model
    const messages = [
        new SystemMessage(systemInstruction),
        new HumanMessage(`Context:\n${context}\n\nQuestion:\n${question}`)
    ];

    // 5. Initialize streaming headers (SSE)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Turn off nginx buffering

    try {
        const chatModel = getChatModel();
        const responseStream = await chatModel.stream(messages);
        
        let answerText = '';

        for await (const chunk of responseStream) {
            const chunkText = chunk.content;
            answerText += chunkText;
            res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
        }

        // 6. Save Conversation History to Database
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

        // 7. Send completion packet with references
        res.write(`data: ${JSON.stringify({ done: true, sources: sourceDocs, contextChunks })}\n\n`);
        res.end();

    } catch (err) {
        logger.error("Error in chat streaming:", err);
        if (res.headersSent) {
            res.write(`data: ${JSON.stringify({ error: "Stream error: " + err.message })}\n\n`);
            res.end();
        } else {
            next(err);
        }
    }
});

const getHistory = asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const historyCollection = client.db('rag_db').collection('history');

    const history = await historyCollection
        .find({ userId: userId })
        .sort({ timestamp: 1 })
        .toArray();

    res.json(history);
});

export { askQuestion, getHistory };
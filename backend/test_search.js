
import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { GoogleGenerativeAI } from "@google/generative-ai";

async function testSearch() {
    const client = new MongoClient(process.env.MONGO_URI);
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
    const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });

    try {
        await client.connect();
        const db = client.db('rag_db');
        const collection = db.collection('vector_store');

        const question = "What is front-end?";
        const qEmbedding = await embeddingModel.embedContent(question);
        const qVector = qEmbedding.embedding.values;

        console.log(`Question: ${question}`);
        console.log(`Query Vector Dim: ${qVector.length}`);

        const pipelineNoFilter = [
            {
                "$vectorSearch": {
                    "index": "default",
                    "path": "vector",
                    "queryVector": qVector,
                    "numCandidates": 100,
                    "limit": 5
                }
            }
        ];

        try {
            const results = await collection.aggregate(pipelineNoFilter).toArray();
            console.log(`Search (No Filter) Results: ${results.length}`);
            if (results.length > 0) {
                console.log("Sample Result Source:", results[0].metadata.source);
            }
        } catch (err) {
            console.log(`❌ Search (No Filter) Failed: ${err.message}`);
        }

    } catch (err) {
        console.error(err);
    } finally {
        await client.close();
    }
}

testSearch();

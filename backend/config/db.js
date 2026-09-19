// backend/config/db.js
import { MongoClient } from 'mongodb';
import 'dotenv/config';

export const client = new MongoClient(process.env.MONGO_URI);

export const ensureVectorIndex = async () => {
    try {
        const db = client.db("rag_db");
        const vectorStore = db.collection("vector_store");
        const indexes = await vectorStore.listSearchIndexes().toArray().catch(() => []);
        const exists = indexes.some(idx => idx.name === "vector_index");
        if (!exists) {
            console.log("ℹ️ Creating missing Atlas Search Index 'vector_index'...");
            await vectorStore.createSearchIndex({
                name: "vector_index",
                type: "vectorSearch",
                definition: {
                    fields: [
                        {
                            type: "vector",
                            path: "vector",
                            numDimensions: 3072,
                            similarity: "cosine"
                        },
                        {
                            type: "filter",
                            path: "metadata.userId"
                        }
                    ]
                }
            });
            console.log("✅ Atlas Search Index 'vector_index' creation request submitted.");
        }
    } catch (err) {
        console.warn("⚠️ Could not automatically verify or create vector index:", err.message);
    }
};

export const connectDB = async () => {
    try {
        await client.connect();
        console.log("✅ MongoDB Atlas Connected Successfully");
        await ensureVectorIndex();
        return client;
    } catch (err) {
        console.error("❌ MongoDB Connection Error:", err);
        process.exit(1);
    }
};
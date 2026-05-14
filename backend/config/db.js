// backend/config/db.js
import { MongoClient } from 'mongodb';
import 'dotenv/config';

export const client = new MongoClient(process.env.MONGO_URI);

export const connectDB = async () => {
    try {
        await client.connect();
        console.log("✅ MongoDB Atlas Connected Successfully");
        return client;
    } catch (err) {
        console.error("❌ MongoDB Connection Error:", err);
        process.exit(1);
    }
};
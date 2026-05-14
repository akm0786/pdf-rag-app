
import 'dotenv/config';
import { MongoClient } from 'mongodb';

async function checkData() {
    const client = new MongoClient(process.env.MONGO_URI);
    try {
        await client.connect();
        const db = client.db('rag_db');
        const collection = db.collection('vector_store');

        const count = await collection.countDocuments();
        console.log(`Total documents in vector_store: ${count}`);

        if (count > 0) {
            const samples = await collection.find({}).limit(5).toArray();
            console.log("Sample documents metadata:");
            samples.forEach((s, i) => {
                console.log(`[${i}] Source: ${s.metadata.source}, UserId: ${s.metadata.userId}, VectorDim: ${s.vector.length}`);
            });

            const users = db.collection('users');
            const userList = await users.find({}).toArray();
            console.log("Registered Users:");
            userList.forEach(u => console.log(`- ${u.email}: ${u._id}`));

        } else {
            console.log("No documents found in vector_store.");
        }

    } catch (err) {
        console.error(err);
    } finally {
        await client.close();
    }
}

checkData();

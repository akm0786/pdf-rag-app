# Neural PDF Architect 🧠📄

![Banner](./banner.png)

A professional, multi-tenant **Retrieval-Augmented Generation (RAG)** platform that transforms static PDF documents into private, conversational knowledge bases. Built with the **MERN stack** and powered by **Google Gemini AI**.

---

## 🚀 Key Features

- **🛡️ Multi-Tenant Architecture**: Secure user accounts with JWT authentication and strict data isolation. Data is siloed so User A can never access User B's knowledge base.
- **🔍 Semantic Retrieval Engine**: Leverages MongoDB Atlas Vector Search and `gemini-embedding-001` (3072-dim) for high-accuracy context retrieval.
- **💬 AI-Powered Conversations**: Utilizes Gemini 1.5 Flash for context-aware, low-latency, and intelligent responses.
- **🔍 Source Transparency**: "Verified Snippets" feature allowing users to inspect the exact text chunks and source documents used by the AI.
- **💾 Persistent Memory**: Full chat history and document metadata persistence using MongoDB.
- **⚡ Professional UI**: A modern, responsive interface built with React, featuring auto-scrolling, Markdown support, and real-time status updates.

---

## 🛠️ Tech Stack

| Component | Technology |
| :--- | :--- |
| **Frontend** | React, Lucide Icons, Axios, Markdown |
| **Backend** | Node.js, Express.js, JWT, Multer |
| **Database** | MongoDB Atlas (Vector Search enabled) |
| **AI/LLM** | Google Gemini 1.5 Flash, Gemini Embeddings |
| **Orchestration** | LangChain (Text Splitting & Document Loading) |

---

## ⚙️ Installation & Setup

### Prerequisites
- Node.js (v18+)
- MongoDB Atlas Account
- Google Gemini API Key

### 1. Clone & Install
```bash
git clone https://github.com/akm0786/pdf-rag-app.git
cd pdf-rag-app

# Install Backend Deps
cd backend && npm install

# Install Frontend Deps
cd ../frontend && npm install
```

### 2. Configure Environment Variables
Create a `.env` file in the `/backend` directory:
```env
PORT=3000
MONGO_URI=your_mongodb_atlas_connection_string
GOOGLE_API_KEY=your_gemini_api_key
JWT_SECRET=your_secure_random_string
FRONTEND_URL=http://localhost:5173
```

### 3. Setup MongoDB Vector Search
To enable the RAG functionality, you **must** create a Vector Search Index in MongoDB Atlas:
1. Go to **Atlas Search** and click **Create Search Index**.
2. Select **JSON Editor** under **Atlas Vector Search**.
3. Target the `rag_db.vector_store` collection.
4. Set the Index Name to `vector_index`.
5. Use the following configuration:
```json
{
  "fields": [
    {
      "numDimensions": 3072,
      "path": "vector",
      "similarity": "cosine",
      "type": "vector"
    },
    {
      "path": "metadata.userId",
      "type": "filter"
    }
  ]
}
```

### 4. Launch
```bash
# Start Backend
cd backend && node index.js

# Start Frontend
cd ../frontend && npm run dev
```

---

## 🏗️ Folder Structure
```text
pdf-rag-app/
├── backend/
│   ├── config/          # Database connection
│   ├── controllers/     # Business logic (Auth, Chat, Docs)
│   ├── middleware/      # JWT Authentication
│   ├── routes/          # API Endpoints
│   └── uploads/         # Temporary PDF storage
├── frontend/
│   ├── src/
│   │   ├── services/    # Axios API client
│   │   └── components/  # React Components
└── README.md
```

---

## 🤝 Contributing
Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License
This project is licensed under the ISC License.
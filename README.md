# Neural PDF 🧠📄

![Banner](./banner.png)

A professional, production-grade **Retrieval-Augmented Generation (RAG)** platform that transforms static PDF documents into private, conversational knowledge bases. Built with the **MERN stack**, powered by **Google Gemini AI**, and architected for real-world scale with background job processing, token streaming, and full observability.

---

## 🚀 Key Features

- **🛡️ Multi-Tenant Architecture** — Secure user accounts with JWT authentication and strict data isolation. Each user's knowledge base is completely siloed.
- **🔄 JWT Refresh Token System** — Automatic silent token refresh with `/refresh` and `/logout` endpoints. Frontend retries failed 401/403 requests transparently.
- **⚡ Background PDF Processing** — PDFs are processed asynchronously via **BullMQ** + **Redis** workers with batched embedding (100 chunks/batch) and exponential backoff retry logic for rate limit resilience.
- **🔍 Semantic Retrieval Engine** — MongoDB Atlas Vector Search with `gemini-embedding-001` (3072-dim) for high-accuracy, per-user context retrieval.
- **💬 Real-Time Streaming Responses** — Server-Sent Events (SSE) stream AI tokens directly to the UI as they are generated, with no waiting for full response completion.
- **🤖 Grounded AI Answers** — `gemini-3-flash-preview` with strict system instructions to answer only from retrieved context — no hallucination.
- **🔍 Source Transparency** — "View Reference Snippets" lets users inspect the exact text chunks and source documents used by the AI for each answer.
- **📊 LangSmith Observability** — Optional LangChain tracing integration for monitoring LLM calls, latency, and token usage.
- **💾 Persistent Memory** — Full chat history and document metadata persisted in MongoDB across sessions.
- **📱 Responsive UI** — Mobile-first chat interface with dynamic viewport height (`100dvh`), safe-area insets for notched phones, and a fully animated collapsible sidebar.

---

## 🛠️ Tech Stack

| Component | Technology |
| :--- | :--- |
| **Frontend** | React, Lucide Icons, Axios, react-markdown |
| **Backend** | Node.js, Express.js, Multer, Winston Logger |
| **Auth** | JWT Access Tokens + Refresh Tokens (MongoDB-backed) |
| **Database** | MongoDB Atlas (Vector Search enabled) |
| **AI / LLM** | Google Gemini 3 Flash Preview, `gemini-embedding-001` |
| **Orchestration** | LangChain (Document Loading, Text Splitting, Google GenAI wrappers) |
| **Background Jobs** | BullMQ + Redis (ioredis) |
| **Observability** | LangSmith (optional), Winston structured logging |

---

## ⚙️ Installation & Setup

### Prerequisites
- Node.js (v18+)
- MongoDB Atlas account with a cluster
- Google Gemini API Key
- Redis (local or cloud — e.g. [Upstash](https://upstash.com))

### 1. Clone & Install
```bash
git clone https://github.com/akm0786/pdf-rag-app.git
cd pdf-rag-app

# Install backend dependencies
cd backend && npm install

# Install frontend dependencies
cd ../frontend && npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` in the `/backend` directory and fill in your values:
```env
# Application
PORT=3000
FRONTEND_URL=http://localhost:5173

# MongoDB
MONGO_URI=your_mongodb_atlas_connection_string

# Google Gemini
GOOGLE_API_KEY=your_gemini_api_key

# JWT Secrets (use long random strings)
JWT_SECRET=your_super_secret_access_key
JWT_REFRESH_SECRET=your_super_secret_refresh_key

# Redis (BullMQ background worker)
REDIS_URL=redis://127.0.0.1:6379

# Model Configuration
GEMINI_CHAT_MODEL=gemini-3-flash-preview
GEMINI_EMBEDDING_MODEL=gemini-embedding-001

# LangSmith Observability (optional)
LANGCHAIN_TRACING_V2=false
LANGCHAIN_API_KEY=lsv2_pt_...
LANGCHAIN_PROJECT=pdf-rag-app
```

### 3. Setup MongoDB Atlas Vector Search Index
This step is **required** to enable semantic search. In MongoDB Atlas:

1. Go to **Atlas Search** → **Create Search Index**
2. Select **JSON Editor** under **Atlas Vector Search**
3. Target the `rag_db.vector_store` collection
4. Set Index Name to `vector_index`
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

### 4. Start Redis
```bash
# If running Redis locally
redis-server
```

### 5. Launch
```bash
# Start the backend (includes the BullMQ worker)
cd backend && node index.js

# Start the frontend dev server
cd ../frontend && npm run dev
```

---

## 🏗️ Folder Structure
```text
pdf-rag-app/
├── backend/
│   ├── config/
│   │   ├── db.js              # MongoDB Atlas connection
│   │   ├── logger.js          # Winston structured logger
│   │   └── queue.js           # BullMQ + Redis connection
│   ├── controllers/
│   │   ├── authController.js  # Register, login, refresh, logout
│   │   ├── chatController.js  # SSE streaming RAG pipeline
│   │   └── documentController.js  # Upload, job queue, delete
│   ├── middleware/
│   │   ├── asyncHandler.js    # Async error wrapper
│   │   ├── authMiddleware.js  # JWT verification
│   │   └── errorHandler.js    # Centralized error handler
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── chatRoutes.js
│   │   └── documentRoutes.js
│   ├── workers/
│   │   └── documentWorker.js  # BullMQ worker: parse → embed → store
│   ├── uploads/               # Temporary PDF storage (auto-cleaned)
│   ├── logs/                  # Winston log output
│   └── index.js               # Express entry point
├── frontend/
│   └── src/
│       ├── services/
│       │   └── api.js         # Axios client with refresh token interceptor
│       ├── App.jsx            # Main chat UI (streaming, polling, sidebar)
│       ├── Auth.jsx           # Login / register page
│       ├── App.css
│       └── index.css          # Design system & mobile responsive styles
├── banner.png
└── README.md
```

---

## 🔁 How It Works

```
User uploads PDF
     │
     ▼
Express → Multer (save temp file)
     │
     ▼
BullMQ job enqueued → Redis
     │
     ▼
documentWorker.js (background):
  1. PDFLoader → parse pages
  2. RecursiveCharacterTextSplitter → chunks
  3. gemini-embedding-001 → batch embed (100/batch, with backoff)
  4. MongoDB Atlas → insert vectors
     │
     ▼
Frontend polls /jobs every 3s → notifies user on completion

User asks question
     │
     ▼
chatController.js:
  1. Embed question → gemini-embedding-001
  2. MongoDB Atlas Vector Search (user-scoped)
  3. Build context with source metadata
  4. Stream tokens via SSE ← gemini-3-flash-preview
  5. Save Q&A to history collection
```

---

## 🤝 Contributing
Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License
This project is licensed under the ISC License.
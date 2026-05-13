# Neural PDF Architect 🧠📄

A professional, multi-tenant Retrieval-Augmented Generation (RAG) platform that transforms static PDF documents into private, conversational knowledge bases. Built with the **MERN stack** and powered by **Google Gemini AI**.

---

## 🚀 Key Features

- **Multi-Tenant Architecture**: Secure user accounts with JWT authentication and strict data isolation. User A cannot access User B's documents or chat history.
- **Semantic Retrieval Engine**: Leverages MongoDB Atlas Vector Search and `text-embedding-004` (3072-dim) for high-accuracy context retrieval.
- **AI-Powered Conversations**: Utilizes Gemini 1.5 Flash for context-aware, low-latency, and intelligent responses.
- **Source Transparency**: "Verified Snippets" feature allowing users to inspect the exact text chunks used by the AI to generate answers.
- **Persistent Memory**: Full chat history and document metadata persistence using MongoDB.
- **Responsive UI**: A modern, dark-mode interface built with React, featuring auto-scrolling and real-time status updates.

## 🛠️ Tech Stack

- **Frontend**: React.js, Lucide Icons, Axios, Markdown Rendering.
- **Backend**: Node.js, Express.js, JWT (jsonwebtoken), Bcrypt.js.
- **Database**: MongoDB Atlas (Vector Search, Collections).
- **AI/LLM**: Google Generative AI (Gemini), LangChain (Text Splitting).
- **Security**: Stateless JWT Authentication, Password Hashing, Metadata Filtering.

## 🏗️ Architecture Overview

1. **Ingestion Pipeline**: 
   - PDF Upload -> Text Extraction -> Recursive Character Splitting -> Vector Embedding (3072-dim) -> Storage in MongoDB with `userId` metadata.
2. **Retrieval Pipeline**: 
   - User Query -> Query Embedding -> MongoDB Vector Search (Filtered by `userId`) -> Context Construction.
3. **Generation Pipeline**: 
   - Context + User Query -> Gemini 1.5 Flash -> Response with specific source attribution and text snippets.

## ⚙️ Installation & Setup

### Prerequisites
- Node.js (v18+)
- MongoDB Atlas Account (with Vector Search enabled)
- Google Gemini API Key

### 1. Clone the repository
```bash
git clone [https://github.com/akm0786/pdf-rag-app.git](https://github.com/akm0786/pdf-rag-app.git)
cd pdf-rag-app
```


### 2. Install dependencies

```bash
# Setup Backend
cd backend
npm install

# Setup Frontend
cd ../frontend
npm install
```


### 3. Configure Environment Variables
- Create a .env file in the /backend directory:

```bash
PORT=3000
MONGODB_URI=your_mongodb_atlas_connection_string
GOOGLE_API_KEY=your_gemini_api_key
JWT_SECRET=your_secure_random_string
```


### 4. Run  the Application

- **Start Backend:** (from /backend)
```bash
node index.js
```

- **Start Frontend:** (from /frontend) 

```bash 
npm run dev
``` 
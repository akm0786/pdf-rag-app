import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Send, Upload, Bot, User, Loader2, Database, Code, Cpu, Menu, X, Trash2, FileText } from 'lucide-react';
import Markdown from 'react-markdown';

function App() {
  const [file, setFile] = useState(null);
  const [question, setQuestion] = useState("");
  const [chat, setChat] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [learnedDocs, setLearnedDocs] = useState([]);
  const [isFetchingDocs, setIsFetchingDocs] = useState(false);

  const chatEndRef = useRef(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chat, isTyping]);

  // Fetch documents on load
  const fetchDocuments = async () => {
    setIsFetchingDocs(true);
    try {
      const res = await axios.get('http://localhost:3000/documents');
      setLearnedDocs(res.data);
    } catch (err) {
      console.error("Failed to fetch documents", err);
    } finally {
      setIsFetchingDocs(false);
    }
  };

  // Run once when the app starts
  useEffect(() => {
    fetchDocuments();
  }, []);

  // Handle Deletion
  const handleDeleteDoc = async (filename) => {
    const confirmDelete = window.confirm(`Are you sure you want the AI to forget ${filename}?`);
    if (!confirmDelete) return;

    try {
      await axios.delete(`http://localhost:3000/documents/${filename}`);
      setChat(prev => [...prev, { role: 'ai', text: `🗑️ **${filename}** has been removed from my memory.` }]);
      fetchDocuments(); // Refresh the list
    } catch (err) {
      alert("Failed to delete document.");
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setIsProcessing(true);
    const formData = new FormData();
    formData.append('pdf', file);

    try {
      await axios.post('http://localhost:3000/process', formData);
      setChat(prev => [...prev, { role: 'ai', text: `✅ **Successfully trained on ${file.name}.** Ask me anything about it!` }]);
      setFile(null);
    } catch (err) {
      alert("Error processing PDF");
    } finally {
      setIsProcessing(false);
    }

    await axios.post('http://localhost:3000/process', formData);
    setChat(prev => [...prev, { role: 'ai', text: `✅ **Successfully trained on ${file.name}.** Ask me anything about it!` }]);
    setFile(null);
    setIsSidebarOpen(false);
    fetchDocuments(); // <--- ADD THIS LINE

  };

  const handleAsk = async (e) => {
    if (e) e.preventDefault();
    if (!question.trim() || isTyping) return;

    const userMsg = { role: 'user', text: question };
    setChat(prev => [...prev, userMsg]); // Preserves history correctly
    setQuestion("");
    setIsTyping(true);

    try {
      const res = await axios.post('http://localhost:3000/ask', { question });
      setChat(prev => [...prev, {
        role: 'ai',
        text: res.data.answer,
        sources: res.data.sources
      }]);
    } catch (err) {
      setChat(prev => [...prev, { role: 'ai', text: "❌ Error connecting to server." }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>

      {/* SIDEBAR */}
      <aside style={{ width: '320px', backgroundColor: '#1f2937', color: '#fff', display: 'flex', flexDirection: 'column', padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '40px' }}>
          <div style={{ backgroundColor: '#3b82f6', padding: '8px', borderRadius: '8px' }}>
            <Cpu size={24} />
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: 0 }}>RAG Engine v1.0</h2>
        </div>

        <div style={{ flex: 1 }}>
          <label style={{ fontSize: '0.875rem', color: '#9ca3af', marginBottom: '8px', display: 'block' }}>KNOWLEDGE INGESTION</label>
          <div style={{ backgroundColor: '#374151', padding: '16px', borderRadius: '12px', border: '1px dashed #4b5563' }}>
            <input type="file" accept=".pdf" style={{ display: 'none' }} id="pdf-upload" onChange={(e) => setFile(e.target.files[0])} />
            <label htmlFor="pdf-upload" style={{ cursor: 'pointer', textAlign: 'center', display: 'block' }}>
              <Upload style={{ margin: '0 auto 8px auto', color: '#9ca3af' }} />
              <div style={{ fontSize: '0.875rem', color: file ? '#fff' : '#9ca3af' }}>{file ? file.name : "Select PDF Document"}</div>
            </label>
            {file && (
              <button
                onClick={handleUpload}
                disabled={isProcessing}
                style={{ width: '100%', marginTop: '16px', padding: '8px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                {isProcessing ? <Loader2 size={16} className="animate-spin" /> : "Start Training"}
              </button>
            )}
          </div>

          <div style={{ marginTop: '32px' }}>
            <label style={{ fontSize: '0.875rem', color: '#9ca3af', marginBottom: '12px', display: 'block' }}>SYSTEM STATUS</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981', fontSize: '0.875rem' }}>
              <div style={{ width: '8px', height: '8px', backgroundColor: '#10b981', borderRadius: '50%' }}></div>
              Gemini 3 Flash Online
            </div>
          </div>
        </div>

        {/* Add this right below the Knowledge Ingestion div inside the sidebar */}
          <div style={{ marginTop: '32px' }}>
            <label style={{ fontSize: '0.875rem', color: '#9ca3af', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>ACTIVE MEMORY</span>
              {isFetchingDocs && <Loader2 size={12} className="animate-spin" />}
            </label>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {learnedDocs.length === 0 && !isFetchingDocs ? (
                <div style={{ fontSize: '0.875rem', color: '#6b7280', fontStyle: 'italic' }}>No documents loaded.</div>
              ) : (
                learnedDocs.map((docName, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#374151', padding: '10px 12px', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                      <FileText size={16} color="#9ca3af" flexShrink={0} />
                      <span style={{ fontSize: '0.875rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{docName}</span>
                    </div>
                    <button 
                      onClick={() => handleDeleteDoc(docName)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '4px', display: 'flex', alignItems: 'center' }}
                      title="Forget this document"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

        <div style={{ borderTop: '1px solid #374151', paddingTop: '20px' }}>
          <div style={{ fontSize: '0.875rem', color: '#9ca3af' }}>Developer</div>
          <div style={{ fontWeight: '600' }}>Abhishek Mishra</div>
        </div>
      </aside>

      {/* MAIN CHAT AREA */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#fff' }}>

        {/* Chat Header */}
        <header style={{ padding: '16px 32px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.125rem' }}>Neural PDF Architect</h3>
            <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Semantic Retrieval Engine</span>
          </div>
          <Code style={{ cursor: 'pointer', color: '#6b7280' }} />        </header>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {chat.length === 0 && (
            <div style={{ textAlign: 'center', marginTop: '10vh' }}>
              <Bot size={64} style={{ color: '#e5e7eb', marginBottom: '16px' }} />
              <h2 style={{ color: '#374151', margin: '0 0 8px 0' }}>How can I help you today?</h2>
              <p style={{ color: '#6b7280', margin: 0 }}>Upload a document to start a contextual conversation.</p>
            </div>
          )}

          {chat.map((msg, i) => (
            <div key={i} style={{ display: 'flex', gap: '16px', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}>
              <div style={{
                width: '36px', height: '36px', borderRadius: '8px',
                backgroundColor: msg.role === 'user' ? '#3b82f6' : '#111827',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0
              }}>
                {msg.role === 'user' ? <User size={20} /> : <Bot size={20} />}
              </div>
              <div style={{
                maxWidth: '70%',
                backgroundColor: msg.role === 'user' ? '#3b82f6' : '#f3f4f6',
                color: msg.role === 'user' ? '#fff' : '#1f2937',
                padding: '16px',
                borderRadius: '16px',
                borderTopRightRadius: msg.role === 'user' ? '2px' : '16px',
                borderTopLeftRadius: msg.role === 'ai' ? '2px' : '16px',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
              }}>
                <div className="markdown-content">
                  <Markdown>{msg.text}</Markdown>
                </div>
                {msg.sources && (
                  <div style={{ marginTop: '12px', fontSize: '0.75rem', opacity: 0.8, borderTop: '1px solid rgba(0,0,0,0.1)', paddingTop: '8px' }}>
                    <Database size={12} style={{ marginRight: '4px', display: 'inline' }} />
                    Context: {msg.sources.join(" | ")}
                  </div>
                )}
              </div>
            </div>
          ))}

          {isTyping && (
            <div style={{ display: 'flex', gap: '16px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: '#111827', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                <Bot size={20} />
              </div>
              <div style={{ backgroundColor: '#f3f4f6', padding: '16px', borderRadius: '16px', borderTopLeftRadius: '2px' }}>
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input Footer */}
        <footer style={{ padding: '24px 32px', backgroundColor: '#fff' }}>
          <form onSubmit={handleAsk} style={{ position: 'relative', maxWidth: '800px', margin: '0 auto' }}>
            <input
              style={{ width: '100%', padding: '16px 60px 16px 20px', borderRadius: '12px', border: '1px solid #d1d5db', outline: 'none', fontSize: '1rem', boxSizing: 'border-box', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask a question about your knowledge base..."
            />
            <button type="submit" style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', width: '40px', height: '40px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Send size={20} />
            </button>
          </form>
          <div style={{ textAlign: 'center', fontSize: '0.75rem', color: '#9ca3af', marginTop: '12px' }}>
            Experimental RAG AI. Answers are generated based on provided PDF context.
          </div>
        </footer>
      </main>
    </div>
  );
}

export default App;
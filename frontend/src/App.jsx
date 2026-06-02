import React, { useState, useEffect, useRef } from 'react';
import { Send, Upload, Bot, User, Loader2, Database, Cpu, Menu, X, Trash2, FileText, LogOut, ChevronRight, MessageSquare, Sparkles } from 'lucide-react';
import Markdown from 'react-markdown';
import Auth from './Auth';
import { documentService, chatService } from './services/api';
import axios from 'axios';

function App() {
  const [file, setFile] = useState(null);
  const [question, setQuestion] = useState("");
  const [chat, setChat] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [learnedDocs, setLearnedDocs] = useState([]);
  const [isFetchingDocs, setIsFetchingDocs] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('token'));
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 1024);
  const [jobs, setJobs] = useState([]);
  const pollingRef = useRef(null);
  const notifiedJobsRef = useRef(new Set()); // tracks job IDs already notified

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 1024) {
        setSidebarOpen(true);
      } else {
        setSidebarOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (pollingRef.current) clearTimeout(pollingRef.current);
    };
  }, []);

  const chatEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chat, isTyping]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('userEmail');
    setChat([]);
    setLearnedDocs([]);
    setJobs([]);
    setFile(null);
    setIsAuthenticated(false);
    if (pollingRef.current) clearTimeout(pollingRef.current);
  };

  const fetchDocuments = async () => {
    setIsFetchingDocs(true);
    try {
      const res = await documentService.getAll();
      setLearnedDocs(res.data);
    } catch (err) {
      console.error("Failed to fetch documents", err);
    } finally {
      setIsFetchingDocs(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await chatService.getHistory();
      if (res.data) setChat(res.data);
    } catch (err) {
      if (err.response?.status === 403 || err.response?.status === 401) handleLogout();
    }
  };

  const fetchJobs = async () => {
    try {
      const res = await documentService.getJobs();
      
      // Notify for completed/failed jobs exactly once using a ref-based Set
      res.data.forEach(newJob => {
        const notifyKey = `${newJob._id}-${newJob.status}`;
        if (!notifiedJobsRef.current.has(notifyKey)) {
          notifiedJobsRef.current.add(notifyKey);
          if (newJob.status === 'completed') {
            setChat(prev => [...prev, { role: 'ai', text: `✅ **Successfully trained on ${newJob.filename}.**` }]);
            fetchDocuments();
          } else if (newJob.status === 'failed') {
            setChat(prev => [...prev, { role: 'ai', text: `❌ **Failed to process ${newJob.filename}:** ${newJob.error || 'Unknown error'}` }]);
          }
        }
      });
      setJobs(res.data);

      // Poll again if there are active jobs in the queue
      const hasActiveJobs = res.data.some(job => job.status === 'pending' || job.status === 'processing');
      if (hasActiveJobs) {
        if (pollingRef.current) clearTimeout(pollingRef.current);
        pollingRef.current = setTimeout(fetchJobs, 3000);
      } else {
        pollingRef.current = null;
      }
    } catch (err) {
      console.error("Failed to fetch jobs", err);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchDocuments();
      fetchHistory();
      fetchJobs();
    }
  }, [isAuthenticated]);

  const handleDeleteDoc = async (filename) => {
    if (!window.confirm(`Remove ${filename} from memory?`)) return;
    try {
      await documentService.delete(filename);
      setChat(prev => [...prev, { role: 'ai', text: `🗑️ **${filename}** has been removed.` }]);
      fetchDocuments();
      fetchJobs();
    } catch (err) {
      alert("Failed to delete document.");
    }
  };

  const handleUpload = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    // Client-side file size limit: 5MB
    const MAX_FILE_SIZE = 5 * 1024 * 1024;
    if (selectedFile.size > MAX_FILE_SIZE) {
      alert(`File size exceeds the 5MB limit. Please upload a smaller PDF.`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setIsProcessing(true);
    const formData = new FormData();
    formData.append('pdf', selectedFile);

    try {
      await documentService.upload(formData);
      setChat(prev => [...prev, { role: 'ai', text: `⏳ **Upload completed. Processing and training on ${selectedFile.name} in the background...**` }]);
      fetchJobs();
    } catch (err) {
      alert(err.response?.data?.error || "Failed to process document.");
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleAsk = async (e) => {
    e.preventDefault();
    if (!question.trim() || isTyping) return;

    const userQ = question;
    setQuestion("");
    setChat(prev => [...prev, { role: 'user', text: userQ }]);
    setIsTyping(true);

    // Add empty streaming ai message
    setChat(prev => [...prev, { role: 'ai', text: '', isStreaming: true }]);

    try {
      const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
      let token = localStorage.getItem('token');

      let response = await fetch(`${BASE_URL}/api/chat/ask`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ question: userQ })
      });

      // Handle token expiration for the fetch request manually
      if (response.status === 401 || response.status === 403) {
        const refreshToken = localStorage.getItem('refreshToken');
        if (refreshToken) {
          try {
            const refreshRes = await axios.post(`${BASE_URL}/api/auth/refresh`, { refreshToken });
            token = refreshRes.data.token;
            localStorage.setItem('token', token);

            // Retry original request
            response = await fetch(`${BASE_URL}/api/chat/ask`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({ question: userQ })
            });
          } catch (refreshErr) {
            handleLogout();
            return;
          }
        } else {
          handleLogout();
          return;
        }
      }

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let accumulatedText = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        
        // Save the partial line for the next chunk
        buffer = lines.pop();

        for (const line of lines) {
          const cleanedLine = line.trim();
          if (!cleanedLine.startsWith('data: ')) continue;

          const jsonString = cleanedLine.slice(6);
          try {
            const data = JSON.parse(jsonString);

            if (data.error) {
              throw new Error(data.error);
            }

            if (data.done) {
              // Finish stream, replace message with final complete payload
              setChat(prev => {
                const updated = [...prev];
                const aiIdx = updated.findLastIndex(msg => msg.role === 'ai');
                if (aiIdx !== -1) {
                  updated[aiIdx] = {
                    role: 'ai',
                    text: accumulatedText,
                    sources: data.sources,
                    contextChunks: data.contextChunks
                  };
                }
                return updated;
              });
            } else if (data.text) {
              accumulatedText += data.text;
              setChat(prev => {
                const updated = [...prev];
                const aiIdx = updated.findLastIndex(msg => msg.role === 'ai');
                if (aiIdx !== -1) {
                  updated[aiIdx] = {
                    ...updated[aiIdx],
                    text: accumulatedText
                  };
                }
                return updated;
              });
            }
          } catch (parseErr) {
            console.error('Error parsing stream chunk:', parseErr);
          }
        }
      }

    } catch (err) {
      console.error(err);
      setChat(prev => {
        const updated = [...prev];
        const aiIdx = updated.findLastIndex(msg => msg.role === 'ai');
        if (aiIdx !== -1) {
          updated[aiIdx] = {
            role: 'ai',
            text: "❌ Failed to connect to neural engine."
          };
        }
        return updated;
      });
    } finally {
      setIsTyping(false);
    }
  };

  if (!isAuthenticated) return <Auth onLoginSuccess={() => setIsAuthenticated(true)} />;

  return (
    <div className="app-layout">

      {/* Sidebar Overlay for Mobile — always rendered, visibility driven by sidebarOpen */}
      <div
        onClick={() => setSidebarOpen(false)}
        style={{
          position: 'fixed', inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(4px)',
          zIndex: 40,
          opacity: sidebarOpen ? 1 : 0,
          pointerEvents: sidebarOpen ? 'auto' : 'none',
          transition: 'opacity 0.3s',
          display: 'none' // hidden on desktop via CSS below; shown on mobile via sidebarOpen
        }}
        className="sidebar-overlay"
      />

      {/* Sidebar */}
      <aside className="glass-panel" style={{
        width: '280px',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        left: sidebarOpen ? 0 : '-300px',
        top: 0,
        transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        zIndex: 50,
        borderRight: '1px solid var(--border)',
        backgroundColor: 'var(--bg-surface)'
      }}>
        <div style={{ padding: '24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: 'var(--primary)', padding: '8px', borderRadius: '8px' }}>
              <Cpu size={20} color="white" />
            </div>
            <span style={{ fontWeight: '700', fontSize: '1.1rem' }}>Neural PDF</span>
          </div>
          <X onClick={() => setSidebarOpen(false)} style={{ cursor: 'pointer' }} />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          <div style={{ marginBottom: '24px' }}>
            <h3 style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px', paddingLeft: '8px' }}>
              Knowledge Base
            </h3>
            <button
              onClick={() => fileInputRef.current.click()}
              disabled={isProcessing}
              style={{
                width: '100%',
                padding: '12px',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                border: '1px dashed var(--primary)',
                borderRadius: '12px',
                color: 'var(--primary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                fontSize: '0.9rem',
                fontWeight: '600',
                transition: 'all 0.2s'
              }}
            >
              {isProcessing ? <Loader2 className="animate-spin" size={18} /> : <><Upload size={18} /> Train New PDF</>}
            </button>
            <input type="file" ref={fileInputRef} onChange={handleUpload} accept=".pdf" style={{ display: 'none' }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {/* Active background jobs */}
            {jobs.filter(job => job.status === 'pending' || job.status === 'processing').map((job, idx) => (
              <div key={`job-${idx}`} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px',
                borderRadius: '10px',
                backgroundColor: 'rgba(59, 130, 246, 0.05)',
                border: '1px dashed var(--primary)',
                fontSize: '0.875rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden', width: '100%' }}>
                  <Loader2 className="animate-spin" size={16} color="var(--primary)" style={{ flexShrink: 0 }} />
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    {job.filename} ({job.status})
                  </span>
                </div>
              </div>
            ))}

            {learnedDocs.map((doc, idx) => (
              <div key={idx} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px',
                borderRadius: '10px',
                backgroundColor: 'rgba(255,255,255,0.03)',
                fontSize: '0.875rem',
                group: 'true'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                  <FileText size={16} color="var(--primary)" />
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc}</span>
                </div>
                <Trash2
                  size={14}
                  onClick={() => handleDeleteDoc(doc)}
                  style={{ cursor: 'pointer', color: 'var(--text-muted)', opacity: 0.5 }}
                />
              </div>
            ))}
            {learnedDocs.length === 0 && !isFetchingDocs && (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                No active knowledge base.
              </div>
            )}
          </div>
        </div>

        <div style={{ padding: '20px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: 'var(--bg-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <User size={20} color="var(--text-muted)" />
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {localStorage.getItem('userEmail')}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Connected</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            style={{
              width: '100%',
              padding: '10px',
              backgroundColor: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: '10px',
              color: '#f87171',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              fontSize: '0.875rem',
              cursor: 'pointer'
            }}
          >
            <LogOut size={16} /> Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`chat-main${sidebarOpen ? ' sidebar-open' : ''}`}>

        {/* Header */}
        <header className="chat-header">
          <div className="header-left">
            <Menu onClick={() => setSidebarOpen(v => !v)} style={{ cursor: 'pointer', flexShrink: 0 }} />
            <div style={{ fontSize: '0.9rem', fontWeight: '500', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Current Neural Session
            </div>
          </div>
          <div className="header-right">
            <Sparkles size={14} color="#fcd34d" />
            <span>Powered by Gemini-3-flash-preview</span>
          </div>
        </header>

        {/* Chat Area */}
        <div className="chat-area">
          <div className="chat-messages">
            {chat.length === 0 && (
              <div style={{ textAlign: 'center', marginTop: '10vh', padding: '0 16px' }} className="entrance-anim">
                <div style={{ background: 'rgba(59, 130, 246, 0.1)', width: '64px', height: '64px', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
                  <MessageSquare size={32} color="var(--primary)" />
                </div>
                <h1 style={{ fontSize: 'clamp(1.4rem, 5vw, 2rem)', fontWeight: '800', marginBottom: '12px' }}>How can I help you today?</h1>
                <p style={{ color: 'var(--text-muted)', fontSize: 'clamp(0.9rem, 3vw, 1.1rem)', maxWidth: '400px', margin: '0 auto' }}>
                  Upload a PDF to build your private context, then ask any question.
                </p>
              </div>
            )}

            {chat.map((msg, i) => (
              <div key={i} className={`msg-row entrance-anim ${msg.role === 'user' ? 'msg-user' : ''}`}>
                <div className={`msg-avatar ${msg.role}`}>
                  {msg.role === 'user' ? <User size={18} color="white" /> : <Bot size={18} color="var(--primary)" />}
                </div>

                <div className={`msg-body ${msg.role}`}>
                  <div className={`msg-bubble ${msg.role}`}>
                    <div className="markdown-content">
                      <Markdown>{msg.text}</Markdown>
                    </div>
                  </div>

                  {msg.role === 'ai' && msg.contextChunks && (
                    <details style={{ width: '100%' }}>
                      <summary style={{
                        fontSize: '0.75rem',
                        padding: '8px 12px',
                        backgroundColor: 'rgba(255,255,255,0.03)',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        color: 'var(--text-muted)',
                        listStyle: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}>
                        <Database size={12} /> View Reference Snippets ({msg.sources?.join(", ")})
                      </summary>
                      <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {msg.contextChunks.map((chunk, idx) => (
                          <div key={idx} style={{
                            padding: '12px',
                            backgroundColor: 'rgba(0,0,0,0.2)',
                            borderRadius: '12px',
                            borderLeft: '3px solid var(--primary)',
                            fontSize: '0.85rem',
                            color: '#d1d5db',
                            fontStyle: 'italic',
                            wordBreak: 'break-word'
                          }}>
                            "{chunk.text}"
                            <div style={{ fontSize: '0.7rem', marginTop: '6px', opacity: 0.5, textAlign: 'right' }}>
                              — {chunk.source}
                            </div>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              </div>
            ))}
            {/* isTyping indicator removed — the streaming AI message bubble already acts as the loading placeholder */}
            <div ref={chatEndRef} />
          </div>
        </div>

        {/* Input Area */}
        <div className="input-area">
          <form className="input-form" onSubmit={handleAsk}>
            <input
              type="text"
              className="input-field"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Query your knowledge base..."
              autoComplete="off"
            />
            <button
              type="submit"
              className="send-btn"
              disabled={!question.trim() || isTyping}
            >
              <Send size={20} />
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}

export default App;
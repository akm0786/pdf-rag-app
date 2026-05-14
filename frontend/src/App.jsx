import React, { useState, useEffect, useRef } from 'react';
import { Send, Upload, Bot, User, Loader2, Database, Cpu, Menu, X, Trash2, FileText, LogOut, ChevronRight, MessageSquare, Sparkles } from 'lucide-react';
import Markdown from 'react-markdown';
import Auth from './Auth';
import { documentService, chatService } from './services/api';

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

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 1024) {
        setSidebarOpen(true);
      } else {
        setSidebarOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
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
    localStorage.removeItem('userEmail');
    setChat([]);
    setLearnedDocs([]);
    setFile(null);
    setIsAuthenticated(false);
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

  useEffect(() => {
    if (isAuthenticated) {
      fetchDocuments();
      fetchHistory();
    }
  }, [isAuthenticated]);

  const handleDeleteDoc = async (filename) => {
    if (!window.confirm(`Remove ${filename} from memory?`)) return;
    try {
      await documentService.delete(filename);
      setChat(prev => [...prev, { role: 'ai', text: `🗑️ **${filename}** has been removed.` }]);
      fetchDocuments();
    } catch (err) {
      alert("Failed to delete document.");
    }
  };

  const handleUpload = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    setIsProcessing(true);
    const formData = new FormData();
    formData.append('pdf', selectedFile);

    try {
      await documentService.upload(formData);
      setChat(prev => [...prev, { role: 'ai', text: `✅ **Successfully trained on ${selectedFile.name}.**` }]);
      fetchDocuments();
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

    try {
      const res = await chatService.askQuestion({ question: userQ });
      setChat(prev => [...prev, {
        role: 'ai',
        text: res.data.answer,
        sources: res.data.sources,
        contextChunks: res.data.contextChunks
      }]);
    } catch (err) {
      setChat(prev => [...prev, { role: 'ai', text: "❌ Failed to connect to neural engine." }]);
    } finally {
      setIsTyping(false);
    }
  };

  if (!isAuthenticated) return <Auth onLoginSuccess={() => setIsAuthenticated(true)} />;

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', backgroundColor: 'var(--bg-main)', overflow: 'hidden' }}>

      {/* Sidebar Overlay for Mobile */}
      {sidebarOpen && window.innerWidth <= 1024 && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 40, backdropFilter: 'blur(4px)' }}
        />
      )}

      {/* Sidebar */}
      <aside className="glass-panel" style={{
        width: '300px',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        position: window.innerWidth <= 1024 ? 'fixed' : 'relative',
        left: sidebarOpen ? 0 : '-300px',
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
          {window.innerWidth <= 1024 && <X onClick={() => setSidebarOpen(false)} style={{ cursor: 'pointer' }} />}
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
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>

        {/* Header */}
        <header style={{
          height: '64px',
          borderBottom: '1px solid var(--border)',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: 'rgba(3, 7, 18, 0.8)',
          backdropFilter: 'blur(10px)',
          position: 'sticky',
          top: 0,
          zIndex: 30
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {!sidebarOpen && <Menu onClick={() => setSidebarOpen(true)} style={{ cursor: 'pointer' }} />}
            <div style={{ fontSize: '0.9rem', fontWeight: '500', color: 'var(--text-muted)' }}>
              Current Neural Session
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            <Sparkles size={14} color="#fcd34d" /> Powered by Gemini 1.5 Flash
          </div>
        </header>

        {/* Chat Area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ width: '100%', maxWidth: '800px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {chat.length === 0 && (
              <div style={{ textAlign: 'center', marginTop: '15vh' }} className="entrance-anim">
                <div style={{ background: 'rgba(59, 130, 246, 0.1)', width: '64px', height: '64px', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
                  <MessageSquare size={32} color="var(--primary)" />
                </div>
                <h1 style={{ fontSize: '2rem', fontWeight: '800', marginBottom: '12px' }}>How can I help you today?</h1>
                <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', maxWidth: '400px', margin: '0 auto' }}>
                  Upload a PDF to build your private context, then ask any question.
                </p>
              </div>
            )}

            {chat.map((msg, i) => (
              <div key={i} className="entrance-anim" style={{
                display: 'flex',
                gap: '16px',
                flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                alignItems: 'flex-start'
              }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  backgroundColor: msg.role === 'user' ? 'var(--primary)' : 'var(--bg-accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  {msg.role === 'user' ? <User size={20} color="white" /> : <Bot size={20} color="var(--primary)" />}
                </div>

                <div style={{
                  maxWidth: 'calc(100% - 70px)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  gap: '8px'
                }}>
                  <div style={{
                    padding: '14px 20px',
                    borderRadius: '20px',
                    borderTopLeftRadius: msg.role === 'ai' ? '4px' : '20px',
                    borderTopRightRadius: msg.role === 'user' ? '4px' : '20px',
                    backgroundColor: msg.role === 'user' ? 'var(--primary)' : 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    boxShadow: msg.role === 'user' ? '0 4px 15px var(--primary-glow)' : 'none'
                  }}>
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
                            fontStyle: 'italic'
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
            {isTyping && (
              <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: 'var(--bg-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Loader2 className="animate-spin" size={20} color="var(--primary)" />
                </div>
                <div style={{ padding: '16px 24px', backgroundColor: 'var(--bg-surface)', borderRadius: '20px', borderTopLeftRadius: '4px', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <div className="typing-dot" style={{ backgroundColor: 'var(--primary)' }}></div>
                    <div className="typing-dot" style={{ backgroundColor: 'var(--primary)' }}></div>
                    <div className="typing-dot" style={{ backgroundColor: 'var(--primary)' }}></div>
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        </div>

        {/* Input Area */}
        <div style={{
          padding: '24px 16px',
          backgroundColor: 'rgba(3, 7, 18, 0.8)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          justifyContent: 'center'
        }}>
          <form
            onSubmit={handleAsk}
            style={{
              width: '100%',
              maxWidth: '800px',
              backgroundColor: 'var(--bg-surface)',
              borderRadius: '20px',
              border: '1px solid var(--border)',
              padding: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              boxShadow: '0 10px 30px -10px rgba(0,0,0,0.5)'
            }}>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Query your knowledge base..."
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                padding: '12px 16px',
                color: 'white',
                fontSize: '1rem',
                outline: 'none'
              }}
            />
            <button
              type="submit"
              disabled={!question.trim() || isTyping}
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '16px',
                backgroundColor: question.trim() ? 'var(--primary)' : 'var(--bg-accent)',
                border: 'none',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: question.trim() ? 'pointer' : 'default',
                transition: 'all 0.2s'
              }}
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
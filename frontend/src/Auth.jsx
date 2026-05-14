import React, { useState } from 'react';
import { authService } from './services/api';
import { Mail, Lock, Cpu, ArrowRight, UserPlus, LogIn, Loader2 } from 'lucide-react';

export default function Auth({ onLoginSuccess }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    // const endpoint = isLogin ? '/login' : '/register';

    try {
      // const res = await axios.post(`${api}${endpoint}`, { email, password });

      if (isLogin) {
        const res = await authService.login({ email, password });
        localStorage.setItem('token', res.data.token);
        localStorage.setItem('userEmail', res.data.email);
        onLoginSuccess();
      } else {
        await authService.register({ email, password });
        alert("Registration successful! Please log in.");
        setIsLogin(true);
      }
    } catch (err) {
      setError(err.response?.data?.error || "Authentication failed");
    } finally {
      // setIsLogin(false); // Removed: This was switching to register mode after every attempt
    }
  };

  return (
    <div style={{
      height: '100vh',
      width: '100vw',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#111827',
      padding: '20px', // Prevents card from touching screen edges on mobile
      boxSizing: 'border-box'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '400px', // Card shrinks on small screens but stops at 400px
        padding: 'clamp(20px, 5vw, 40px)', // Responsive padding
        backgroundColor: '#1f2937',
        borderRadius: '16px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        boxSizing: 'border-box'
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
          <div style={{ backgroundColor: '#3b82f6', padding: '12px', borderRadius: '12px' }}>
            <Cpu size={32} color="white" />
          </div>
        </div>

        <h2 style={{ color: 'white', textAlign: 'center', fontSize: '1.5rem', marginBottom: '8px' }}>
          {isLogin ? 'Welcome Back' : 'Create Account'}
        </h2>
        <p style={{ color: '#9ca3af', textAlign: 'center', marginBottom: '32px', fontSize: '0.875rem' }}>
          {isLogin ? 'Access your private neural knowledge base' : 'Start building your persistent AI memory'}
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <Mail size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
            <input
              type="email" placeholder="Email Address" required
              style={{
                width: '100%',
                padding: '12px 12px 12px 40px',
                backgroundColor: '#374151',
                border: '1px solid #4b5563',
                borderRadius: '8px',
                color: 'white',
                outline: 'none',
                boxSizing: 'border-box' // 👈 This is the magic fix
              }}
              value={email} onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div style={{ position: 'relative', width: '100%' }}>
            <Lock size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
            <input
              type="password" placeholder="Password" required
              style={{
                width: '100%',
                padding: '12px 12px 12px 40px',
                backgroundColor: '#374151',
                border: '1px solid #4b5563',
                borderRadius: '8px',
                color: 'white',
                outline: 'none',
                boxSizing: 'border-box' // 👈 Essential for responsive inputs
              }}
              value={password} onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && <div style={{ color: '#ef4444', fontSize: '0.875rem', textAlign: 'center' }}>{error}</div>}

          <button type="submit" style={{ width: '100%', padding: '12px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '8px' }}>
            {isLogin ? 'Sign In' : 'Register'} <ArrowRight size={18} />
          </button>
        </form>

        <button
          onClick={() => setIsLogin(!isLogin)}
          style={{ width: '100%', background: 'none', border: 'none', color: '#9ca3af', marginTop: '24px', cursor: 'pointer', fontSize: '0.875rem' }}
        >
          {isLogin ? "Don't have an account? Sign Up" : "Already have an account? Log In"}
        </button>
      </div>
    </div>
  );
}

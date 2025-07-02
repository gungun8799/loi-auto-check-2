// src/pages/LoginPage.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Pages.css'; // adjust path if needed

// point this at your backend (e.g. "http://localhost:5001" or an env var)
const apiUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5001';

export default function LoginPage({ setUser }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';


  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      console.log('🔐 Attempting login with:', { email, password });
      const res = await fetch(`${apiUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const result = await res.json();
      if (res.ok) {
        // store in parent
        setUser({ email: result.email, role: result.role, password });
        // redirect based on role:
        if (result.role === 'admin') {
          navigate('/dashboard');
        } else {
          navigate('/not-found'); // or some “no privilege” page
        }
      } else {
        setError(result.error || 'Login failed');
      }
    } catch (err) {
      console.error('❌ Login error:', err);
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-container">
      <form onSubmit={handleLogin} className="login-form">
        <h2>LOI Auto-check</h2>
        {error && <div className="error-message">{error}</div>}
        <input
          className="login-input"
          type="text"
          placeholder="Employee ID (THxxxxxxxx)"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />
        <input
          className="login-input"
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
        />
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? (
            <>
              <span className="spinner" /> Logging in…
            </>
          ) : (
            'Login'
          )}
        </button>
      </form>
    </div>
  );
}
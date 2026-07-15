import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';

// Simple theme matching the rest of the POS
const T = {
  ink: '#0f172a',
  inkSoft: '#64748b',
  line: '#334155',
  surface: '#1e293b',
  canvas: '#0f172a',
  accent: '#16a34a',
  danger: '#ef4444',
};

const Login = () => {
  const [key, setKey] = useState('');
  const loginWithLicenseKey = useAuthStore((state) => state.loginWithLicenseKey);
  const isLoading = useAuthStore((state) => state.isLoading);
  const error = useAuthStore((state) => state.error);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!key.trim()) return;
    
    const success = await loginWithLicenseKey(key.trim());
    if (success) {
      navigate('/');
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #000000 0%, #09090b 50%, #14532d 100%)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '16px',
      fontFamily: 'system-ui, sans-serif'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '400px',
        background: 'rgba(24, 24, 27, 0.8)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(39, 39, 42, 0.8)',
        borderRadius: '16px',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
        overflow: 'hidden'
      }}>
        <div style={{ padding: '32px' }}>
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <div style={{
              width: '64px',
              height: '64px',
              background: 'linear-gradient(to top right, #16a34a, #10b981)',
              borderRadius: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px auto',
              boxShadow: '0 10px 15px -3px rgba(22, 163, 74, 0.3)'
            }}>
              <svg style={{ width: '32px', height: '32px', color: '#fff' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.071 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
              </svg>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#fff', margin: 0, textTransform: 'uppercase', letterSpacing: '-0.02em' }}>
                POINT OF SALE
              </h2>
              <span style={{
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '10px',
                fontWeight: 'bold',
                background: 'rgba(34, 197, 94, 0.2)',
                color: '#4ade80',
                textTransform: 'uppercase',
                border: '1px solid rgba(34, 197, 94, 0.3)'
              }}>Beta</span>
            </div>
            <p style={{ color: '#94a3b8', marginTop: '8px', fontSize: '14px', margin: '8px 0 0' }}>
              Enter your license key to connect to your store.
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div>
              <label htmlFor="licenseKey" style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#d4d4d8', marginBottom: '8px' }}>
                License Key
              </label>
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', top: 0, bottom: 0, left: '12px', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
                  <svg style={{ height: '20px', width: '20px', color: '#64748b' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                </div>
                <input
                  id="licenseKey"
                  type="password"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  style={{
                    display: 'block', width: '100%', boxSizing: 'border-box',
                    padding: '12px 12px 12px 40px',
                    border: '1px solid #3f3f46', borderRadius: '12px',
                    background: '#27272a', color: '#fff', fontSize: '15px',
                    outline: 'none'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#22c55e'}
                  onBlur={(e) => e.target.style.borderColor = '#3f3f46'}
                  placeholder="XXXX-XXXX-XXXX-XXXX"
                  required
                />
              </div>
            </div>

            {error && (
              <div style={{
                padding: '12px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.2)', color: '#f87171',
                fontSize: '14px', display: 'flex', alignItems: 'flex-start', gap: '8px'
              }}>
                <svg style={{ width: '20px', height: '20px', flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span style={{ lineHeight: 1.4 }}>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              style={{
                width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center',
                padding: '12px 16px', border: 'none', borderRadius: '12px',
                fontSize: '14px', fontWeight: 'bold', color: '#000',
                background: isLoading ? '#86efac' : '#22c55e',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                transition: 'background 0.2s', gap: '8px'
              }}
              onMouseEnter={(e) => { if (!isLoading) e.target.style.background = '#4ade80'; }}
              onMouseLeave={(e) => { if (!isLoading) e.target.style.background = '#22c55e'; }}
            >
              {isLoading ? (
                <>
                  <svg style={{ width: '20px', height: '20px', animation: 'spin 1s linear infinite' }} fill="none" viewBox="0 0 24 24">
                    <circle opacity="0.25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path opacity="0.75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Connecting...
                  <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
                </>
              ) : (
                <>
                  Connect
                  <svg style={{ width: '16px', height: '16px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
      
      <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '12px', color: '#71717a', fontWeight: 500, letterSpacing: '0.025em' }}>
        Developed By <span style={{ fontWeight: 600, color: '#a1a1aa' }}>Anas Riaz</span>
      </div>
    </div>
  );
};

export default Login;

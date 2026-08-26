import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import ProfileModal from './ProfileModal';

/* ─── Inline SVG icons ─────────────────────────────────────── */
const Svg = ({ children, size = 16, strokeWidth = "1.65" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
    style={{ display: 'block', flexShrink: 0 }}>
    {children}
  </svg>
);
const IcoScan   = ({ size = 16 }) => <Svg size={size}><rect x="3" y="3" width="5" height="5" rx="1" /><rect x="16" y="3" width="5" height="5" rx="1" /><rect x="3" y="16" width="5" height="5" rx="1" /><path d="M21 16h-3a2 2 0 0 0-2 2v3M21 21v.01M12 7v3a2 2 0 0 1-2 2H7M3 12h.01M12 3h.01M7 17H4M17 12h.01M12 12h.01" /></Svg>;
const IcoSettings = ({ size = 14 }) => <Svg size={size}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></Svg>;
const IcoLogOut = ({ size = 14 }) => <Svg size={size}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></Svg>;
const IcoExpand = ({ size = 14 }) => <Svg size={size}><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></Svg>;
const IcoCollapse = ({ size = 14 }) => <Svg size={size}><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/></Svg>;

/* ─── TopNav Item ─────────────────────────────────────────── */


export default function Layout({ children }) {
  const storeName = useAuthStore((s) => s.storeName);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const location = useLocation();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSignOutModalOpen, setIsSignOutModalOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement));
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch (err) {
      console.error('Fullscreen mode is not available.', err);
    }
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', minHeight: '100vh',
      background: '#f8fafc', color: '#0f172a',
      fontFamily: '"Inter", system-ui, -apple-system, sans-serif',
    }}>
      {isOffline && (
        <div style={{ background: '#ef4444', color: '#fff', textAlign: 'center', padding: '8px', fontSize: '13px', fontWeight: 'bold' }}>
          No Internet Connection. You are offline.
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        /* Custom scrollbar for webkit */
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }

        @media (max-width: 640px) {
          .layout-header {
            padding: 0 16px !important;
            height: 56px !important;
          }
          .layout-brand-text {
            font-size: 15px !important;
          }
          .layout-actions {
            gap: 8px !important;
          }
          .layout-btn-fullscreen {
            display: none !important;
          }
          .layout-signout-text {
            display: none !important;
          }
          .layout-signout-btn {
            padding: 8px !important;
            border-radius: 50% !important;
            width: 34px !important;
            height: 34px !important;
            justify-content: center !important;
          }
        }
      `}</style>

      {/* ── Top Navigation Bar ───────────────────────────────────────────── */}
      <header className="layout-header" style={{
        height: 64, background: '#ffffff', borderBottom: '1px solid #e2e8f0',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', flexShrink: 0, position: 'sticky', top: 0, zIndex: 40,
      }}>
        {/* Left: Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 9,
            background: 'linear-gradient(135deg, #16a34a 0%, #10b981 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff',
            boxShadow: '0 4px 10px -2px rgba(22, 163, 74, 0.4)', flexShrink: 0
          }}>
            <IcoScan size={17} />
          </div>
          <span className="layout-brand-text" style={{
            fontSize: 16, fontWeight: 800, color: '#0f172a',
            letterSpacing: '-0.02em', textTransform: 'uppercase', lineHeight: 1
          }}>
            {storeName || 'POS Store'}
          </span>
        </div>

        {/* Right: Actions / Profile */}
        <div className="layout-actions" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            type="button"
            className="layout-btn-fullscreen"
            onClick={toggleFullscreen}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 36, height: 36, background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '50%',
              color: '#64748b', cursor: 'pointer', transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#0f172a'; e.currentTarget.style.borderColor = '#cbd5e1'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#64748b'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <IcoCollapse size={16} /> : <IcoExpand size={16} />}
          </button>
          <button
            type="button"
            onClick={() => setIsProfileOpen(true)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 36, height: 36, background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '50%',
              color: '#64748b', cursor: 'pointer', transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#0f172a'; e.currentTarget.style.borderColor = '#cbd5e1'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#64748b'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
            title="Store Profile"
          >
            <IcoSettings size={16} />
          </button>
          <button
            type="button"
            className="layout-signout-btn"
            onClick={() => setIsSignOutModalOpen(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
              borderRadius: 20, border: '1px solid #e2e8f0', background: '#ffffff',
              color: '#64748b', fontWeight: 600, fontSize: 13, cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.borderColor = '#fecaca'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#ffffff'; e.currentTarget.style.color = '#64748b'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
            title="Sign Out"
          >
            <IcoLogOut size={14} />
            <span className="layout-signout-text">Sign Out</span>
          </button>
        </div>
      </header>

      {/* ── Main Content Area ─────────────────────────────────── */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {children}
      </main>

      {isProfileOpen && <ProfileModal onClose={() => setIsProfileOpen(false)} />}

      {isSignOutModalOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div style={{ background: '#ffffff', width: '100%', maxWidth: 400, borderRadius: 16, display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px -12px rgba(15,23,42,0.3)', border: '1px solid #fecaca', overflow: 'hidden' }}>
            <div style={{ padding: '24px 28px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: '#fef2f2', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <IcoLogOut size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: '#0f172a', margin: 0, letterSpacing: '-0.01em' }}>Sign Out</h3>
                <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0', lineHeight: 1.4 }}>
                  Are you sure you want to sign out of the terminal?
                </p>
              </div>
            </div>
            <div style={{ padding: '20px 28px', background: '#f8fafc', display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setIsSignOutModalOpen(false)}
                style={{
                  background: 'transparent', border: '1px solid #cbd5e1', borderRadius: 8,
                  color: '#64748b', fontSize: 14, fontWeight: 600, padding: '10px 18px', cursor: 'pointer', transition: 'all 0.15s'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#0f172a'; e.currentTarget.style.borderColor = '#94a3b8'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#64748b'; e.currentTarget.style.borderColor = '#cbd5e1'; }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setIsSignOutModalOpen(false);
                  logout(); 
                  navigate('/login'); 
                }}
                style={{
                  background: '#ef4444', border: 'none', borderRadius: 8,
                  color: '#ffffff', fontSize: 14, fontWeight: 600, padding: '10px 18px', cursor: 'pointer',
                  boxShadow: '0 2px 5px rgba(239, 68, 68, 0.2)', transition: 'background 0.15s'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#dc2626'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#ef4444'; }}
              >
                Yes, sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

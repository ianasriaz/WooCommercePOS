import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuthStore } from '../store/useAuthStore';

const IcoX = ({ s = 14 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18M6 6l12 12"/>
  </svg>
);

const IcoStore = ({ s = 14 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);

function ProfileModal({ onClose }) {
  const storePhone = useAuthStore((s) => s.storePhone);
  const storeAddress = useAuthStore((s) => s.storeAddress);
  const updateProfile = useAuthStore((s) => s.updateProfile);

  const [phone, setPhone] = useState(storePhone || '');
  const [address, setAddress] = useState(storeAddress || '');

  const handleSave = () => {
    updateProfile(phone, address);
    onClose();
  };

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 60,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(6,10,16,0.85)', backdropFilter: 'blur(8px)',
      padding: 20
    }}>
      <div style={{
        background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16,
        width: '100%', maxWidth: 420, overflow: 'hidden',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)'
      }}>
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid #e2e8f0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#0f172a' }}>
            <div style={{ color: '#16a34a' }}><IcoStore s={18} /></div>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Store Profile</h2>
          </div>
          <button type="button" onClick={onClose} style={{
            background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer',
            padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 6, transition: '0.2s'
          }} onMouseEnter={(e) => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#0f172a'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#64748b'; }}>
            <IcoX s={18} />
          </button>
        </div>

        <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
            Update your store's contact information. This information will be printed at the top of your customer receipts.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#64748b' }}>
              Store Phone Number
            </label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. +92 300 1234567"
              style={{
                background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 10,
                color: '#0f172a', padding: '12px 14px', fontSize: 14, outline: 'none',
                width: '100%', boxSizing: 'border-box', boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
              }}
              onFocus={(e) => e.target.style.borderColor = '#16a34a'}
              onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#64748b' }}>
              Store Address
            </label>
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="123 Main Street, City"
              rows={3}
              style={{
                background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 10,
                color: '#0f172a', padding: '12px 14px', fontSize: 14, outline: 'none',
                width: '100%', resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
                boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
              }}
              onFocus={(e) => e.target.style.borderColor = '#16a34a'}
              onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
            />
          </div>
        </div>

        <div style={{
          padding: '16px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0',
          display: 'flex', justifyContent: 'flex-end', gap: 12
        }}>
          <button type="button" onClick={onClose} style={{
            background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8,
            color: '#475569', padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
          }} onMouseEnter={(e) => { e.currentTarget.style.background = '#f1f5f9'; }} onMouseLeave={(e) => { e.currentTarget.style.background = '#ffffff'; }}>
            Cancel
          </button>
          <button type="button" onClick={handleSave} style={{
            background: '#16a34a', border: 'none', borderRadius: 8,
            color: '#ffffff', padding: '10px 24px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(22,163,74,0.3)'
          }} onMouseEnter={(e) => { e.currentTarget.style.background = '#15803d'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(22,163,74,0.4)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = '#16a34a'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(22,163,74,0.3)'; }}>
            Save Profile
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default ProfileModal;

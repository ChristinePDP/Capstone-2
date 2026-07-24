import { useState } from 'react';

import brandLogo from '../assets/427bffe9-d983-4566-9ec9-de6c2b1bdaa2-removebg-preview.png';
import * as authService from '../services/authService';

// ── SVG Icons ─────────────────────────────────────────────────
const IconMail = () => (
  <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
    <polyline points="22,6 12,13 2,6"/>
  </svg>
);
const IconLock = () => (
  <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);
const IconEye = ({ slashed }) => slashed ? (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
) : (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);
const IconSignIn = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15 }}>
    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
    <polyline points="10 17 15 12 10 7"/>
    <line x1="15" y1="12" x2="3" y2="12"/>
  </svg>
);

// ── Shared Input Field ────────────────────────────────────────
function InputField({ icon: Icon, type, value, onChange, placeholder, autoComplete, error, children }) {
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <span style={{
        position: 'absolute', left: 11,
        width: 15, height: 15,
        color: '#94A3B8',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none',
        transition: 'color 0.15s',
      }}>
        <Icon />
      </span>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        style={{
          width: '100%',
          padding: '10px 38px 10px 38px',
          background: '#fff',
          border: `1px solid ${error ? '#EF4444' : '#E2E8F0'}`,
          borderRadius: 9,
          fontFamily: 'inherit',
          fontSize: 14,
          fontWeight: 500,
          color: '#0F172A',
          outline: 'none',
          boxShadow: error ? '0 0 0 3px #FEF2F2' : 'none',
          transition: 'border-color 0.15s, box-shadow 0.15s',
          boxSizing: 'border-box'
        }}
        onFocus={e => {
          e.target.style.borderColor = error ? '#EF4444' : '#5C3317';
          e.target.style.boxShadow = error ? '0 0 0 3px #FEF2F2' : '0 0 0 3px #FDF6F0';
        }}
        onBlur={e => {
          e.target.style.borderColor = error ? '#EF4444' : '#E2E8F0';
          e.target.style.boxShadow = error ? '0 0 0 3px #FEF2F2' : 'none';
        }}
      />
      {children}
    </div>
  );
}

// ── Toggle PW Button ──────────────────────────────────────────
function TogglePwBtn({ shown, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      tabIndex={-1}
      style={{
        position: 'absolute', right: 10,
        background: 'none', border: 'none', cursor: 'pointer',
        color: '#94A3B8', display: 'flex', alignItems: 'center',
        padding: 2, width: 20, height: 20,
        transition: 'color 0.12s',
      }}
      onMouseEnter={e => e.currentTarget.style.color = '#334155'}
      onMouseLeave={e => e.currentTarget.style.color = '#94A3B8'}
    >
      <IconEye slashed={shown} />
    </button>
  );
}

// ── Field Wrapper ─────────────────────────────────────────────
function Field({ label, error, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{
        display: 'block', marginBottom: 6,
        fontSize: 12, fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '0.07em',
        color: '#64748B',
      }}>{label}</label>
      {children}
      {error && (
        <p style={{ fontSize: 12, color: '#EF4444', marginTop: 5, fontWeight: 500 }}>{error}</p>
      )}
    </div>
  );
}

// ── Primary Button ────────────────────────────────────────────
function PrimaryBtn({ onClick, children, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%', padding: '11px',
        background: disabled ? '#E2E8F0' : '#5C3317',
        color: disabled ? '#94A3B8' : '#fff',
        border: 'none', borderRadius: 9,
        fontFamily: 'inherit', fontSize: 14, fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        transition: 'background 0.15s, transform 0.1s',
        boxShadow: disabled ? 'none' : '0 4px 14px rgba(92,51,23,0.28)',
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = '#3E2008'; }}
      onMouseLeave={e => { if (!disabled) e.currentTarget.style.background = '#5C3317'; }}
      onMouseDown={e => { if (!disabled) e.currentTarget.style.transform = 'scale(0.98)'; }}
      onMouseUp={e => { e.currentTarget.style.transform = 'none'; }}
    >
      {children}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function LoginPage({ onLogin }) {

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loginErrors, setLoginErrors] = useState({});
  const [loginPending, setLoginPending] = useState(false);

  const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

  const doLogin = async () => {
    const errs = {};
    if (!email || !isValidEmail(email)) errs.email = 'Please enter a valid email address.';
    if (!password) errs.password = 'Password is required.';
    setLoginErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setLoginPending(true);
    try {
      const result = await authService.login(email, password);
      onLogin(result.admin);
    } catch (err) {
      setLoginErrors({ password: err.message || 'Invalid email or password.' });
    } finally {
      setLoginPending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key !== 'Enter') return;
    doLogin();
  };

  const S = {
    root: {
      minHeight: '100vh',
      background: '#F8FAFC',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif",
      WebkitFontSmoothing: 'antialiased',
      position: 'relative',
      overflow: 'hidden',
    },
    gridBg: {
      position: 'fixed', inset: 0,
      backgroundImage: 'linear-gradient(#E2E8F0 1px, transparent 1px), linear-gradient(90deg, #E2E8F0 1px, transparent 1px)',
      backgroundSize: '40px 40px',
      opacity: 0.45,
      pointerEvents: 'none',
    },
    card: {
      background: '#fff',
      border: '1px solid #E2E8F0',
      borderRadius: 22,
      boxShadow: '0 20px 50px rgba(0,0,0,0.10), 0 6px 16px rgba(0,0,0,0.06)',
      width: '100%',
      maxWidth: 1100,
      position: 'relative',
      zIndex: 1,
      overflow: 'hidden',
      animation: 'cardIn 0.4s cubic-bezier(0.22,1,0.36,1) both',
    },
    brandPanel: {
      flexShrink: 0,
      background: '#3B1F0A',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      overflow: 'hidden',
    },
    formPanel: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
    },
    panelTitle: { fontSize: 22, fontWeight: 700, color: '#0F172A', marginBottom: 6 },
    panelSub:   { fontSize: 14, color: '#64748B', marginBottom: 28, lineHeight: 1.6 },
  };

  return (
    <div style={S.root} onKeyDown={handleKeyDown}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap');
        
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(20px) scale(0.98); }
          to   { opacity: 1; transform: none; }
        }
        
        .input-icon { width: 15px; height: 15px; }

        /* ── RESPONSIVE CLASSES ── */
        .responsive-card {
          display: flex;
          flex-direction: row;
          min-height: 700px;
          margin: 24px 16px;
        }
        .responsive-brand {
          width: 580px;
          padding: 48px 32px;
        }
        .responsive-logo {
          width: 300px;
          height: auto;
          margin-bottom: 20px;
        }
        .responsive-title {
          font-size: 22px;
        }
        .responsive-form {
          padding: 48px 44px;
        }

        /* ── MEDIA QUERIES PARA SA TABLET AT MOBILE ── */
        @media (max-width: 900px) {
          .responsive-card {
            flex-direction: column;
            min-height: auto;
            max-height: calc(100vh - 32px); /* Tinitiyak na hindi lalampas sa screen height */
            overflow-y: auto; /* Magkakaroon ng scrollbar ang loob kapag sobrang liit ng phone */
            margin: 16px; /* Binawasan ang margin para mas lumaki ang space sa loob */
          }
          .responsive-brand {
            width: 100%;
            padding: 24px 16px; /* Pinaliit lalo ang padding */
          }
          .responsive-logo {
            width: 130px; /* Pinaliit pa lalo para sa maliit na screens */
            margin-bottom: 8px;
          }
          .responsive-title {
            font-size: 18px;
          }
          .responsive-form {
            padding: 24px 20px; /* Mas maliit na padding sa form area */
          }
        }
      `}</style>

      {/* Grid Background */}
      <div style={S.gridBg} />

      <div style={S.card} className="responsive-card">

        {/* ── LEFT: BRAND PANEL ── */}
        <div style={S.brandPanel} className="responsive-brand">
          <div style={{ position:'absolute', top:-70, right:-70, width:240, height:240, borderRadius:'50%', background:'rgba(255,255,255,0.07)', pointerEvents:'none' }} />
          <div style={{ position:'absolute', bottom:-90, left:-50, width:280, height:280, borderRadius:'50%', background:'rgba(255,255,255,0.05)', pointerEvents:'none' }} />

          <img
            src={brandLogo}
            alt="Aileen & Niculus Logo"
            className="responsive-logo"
            style={{ position: 'relative', zIndex: 1, filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.5))' }}
          />
          <div style={{ zIndex: 1, position: 'relative', textAlign: 'center' }}>
            <div className="responsive-title" style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, color: '#fff', lineHeight: 1.55, letterSpacing: '-0.01em' }}>
              Aileen Cake Max<br/>Bake Shop
            </div>
          </div>
        </div>

        {/* ── RIGHT: FORM PANEL ── */}
        <div style={S.formPanel} className="responsive-form">
          <div>
            <h1 style={S.panelTitle}>Welcome back</h1>
            <p style={S.panelSub}>Sign in to your admin account to continue.</p>

            <Field label="Email Address" error={loginErrors.email}>
              <InputField
                icon={IconMail}
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="@gmail.com"
                autoComplete="email"
                error={loginErrors.email}
              />
            </Field>

            <Field label="Password" error={loginErrors.password}>
              <InputField
                icon={IconLock}
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                error={loginErrors.password}
              >
                <TogglePwBtn shown={showPw} onToggle={() => setShowPw(v => !v)} />
              </InputField>
            </Field>

            <div style={{ height: 20 }} />

            <PrimaryBtn onClick={doLogin} disabled={loginPending}>
              <IconSignIn /> {loginPending ? 'Signing in...' : 'Sign in'}
            </PrimaryBtn>
          </div>
        </div>

      </div>
    </div>
  );
}
import { useState, useEffect, useRef } from 'react';

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
const IconArrowLeft = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
    <line x1="19" y1="12" x2="5" y2="12"/>
    <polyline points="12 19 5 12 12 5"/>
  </svg>
);
const IconCheckCircle = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15, flexShrink: 0 }}>
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
    <polyline points="22 4 12 14.01 9 11.01"/>
  </svg>
);

// ── Validation helpers ───────────────────────────────────────
const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const isValidOtp = (v) => /^\d{8}$/.test(v);

function passwordIssues(v) {
  const issues = [];
  if (v.length < 8) issues.push('at least 8 characters');
  if (!/[A-Z]/.test(v)) issues.push('one uppercase letter');
  if (!/[a-z]/.test(v)) issues.push('one lowercase letter');
  if (!/[0-9]/.test(v)) issues.push('one number');
  return issues;
}

// ── Shared Input Field ────────────────────────────────────────
function InputField({ icon: Icon, type, value, onChange, placeholder, autoComplete, error, inputMode, maxLength, children }) {
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
        inputMode={inputMode}
        maxLength={maxLength}
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

// ── NEW: Box Input UI Para sa OTP ─────────────────────────────
function OtpBoxInput({ length = 8, value, onChange, error }) {
  const inputs = useRef([]);

  const handleChange = (e, index) => {
    const val = e.target.value.replace(/\D/g, ''); // Numbers only
    const otpArray = value.padEnd(length, ' ').split('');

    if (val) {
      otpArray[index] = val[val.length - 1]; // Use last typed char
      onChange(otpArray.join('').replace(/ /g, ''));
      // Move to next box automatically
      if (index < length - 1) inputs.current[index + 1].focus();
    }
  };

  const handleKeyDown = (e, index) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const otpArray = value.padEnd(length, ' ').split('');
      if (otpArray[index] !== ' ') {
        otpArray[index] = ' ';
        onChange(otpArray.join('').replace(/ /g, ''));
      } else if (index > 0) {
        otpArray[index - 1] = ' ';
        onChange(otpArray.join('').replace(/ /g, ''));
        inputs.current[index - 1].focus();
      }
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (pasted) {
      onChange(pasted);
      const nextFocus = Math.min(pasted.length, length - 1);
      inputs.current[nextFocus].focus();
    }
  };

  return (
    <div style={{ display: 'flex', gap: 'clamp(4px, 1.5vw, 8px)', justifyContent: 'space-between', marginBottom: error ? '6px' : '0' }}>
      {Array.from({ length }).map((_, index) => {
        const char = value[index] || '';
        return (
          <input
            key={index}
            ref={el => inputs.current[index] = el}
            type="text"
            inputMode="numeric"
            maxLength={2}
            value={char}
            onChange={(e) => handleChange(e, index)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            onPaste={handlePaste}
            style={{
              width: '100%',
              minWidth: '32px',
              maxWidth: '48px',
              aspectRatio: '1', // Makes it a perfect square
              textAlign: 'center',
              fontSize: '18px',
              fontWeight: '700',
              color: '#0F172A',
              background: '#fff',
              border: `1px solid ${error ? '#EF4444' : '#E2E8F0'}`,
              borderRadius: '9px',
              outline: 'none',
              boxShadow: error ? '0 0 0 3px #FEF2F2' : 'none',
              transition: 'border-color 0.15s, box-shadow 0.15s',
              padding: 0
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
        );
      })}
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
function Field({ label, error, hint, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
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
      {!error && hint && (
        <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 5, fontWeight: 500 }}>{hint}</p>
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

// ── Text Link Button (Forgot password? / Back to Sign in / Resend) ──
function LinkBtn({ onClick, children, disabled, style }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        background: 'none', border: 'none', padding: 0,
        fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
        color: disabled ? '#CBD5E1' : '#5C3317',
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'inline-flex', alignItems: 'center', gap: 6,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

// ── Info / Success Banner ─────────────────────────────────────
function Banner({ children }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 8,
      background: '#F0FDF4', border: '1px solid #BBF7D0',
      borderRadius: 9, padding: '10px 12px',
      color: '#166534', fontSize: 13, fontWeight: 600,
      marginBottom: 14, lineHeight: 1.5,
    }}>
      <IconCheckCircle />
      <span>{children}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function LoginPage({ onLogin }) {

  // 'login' | 'forgot' | 'verify-otp' | 'set-password'
  const [view, setView] = useState('login');
  const [infoMessage, setInfoMessage] = useState('');

  // ── Login state ──
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loginErrors, setLoginErrors] = useState({});
  const [loginPending, setLoginPending] = useState(false);

  // ── Forgot-password state ──
  const [forgotErrors, setForgotErrors] = useState({});
  const [forgotPending, setForgotPending] = useState(false);

  // ── Reset-password state ──
  const [resetEmail, setResetEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [resetErrors, setResetErrors] = useState({});
  const [resetPending, setResetPending] = useState(false);

  // ── Resend cooldown (iwas spam-click ng "Resend code") ──
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownRef = useRef(null);

  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    cooldownRef.current = setInterval(() => {
      setResendCooldown((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(cooldownRef.current);
  }, [resendCooldown]);

  // ── View transitions ──
  const goToLogin = () => {
    setView('login');
    setPassword('');
    setLoginErrors({});
    setForgotErrors({});
    setResetErrors({});
  };

  const goToForgot = () => {
    setView('forgot');
    setInfoMessage('');
    setForgotErrors({});
  };

  // ✅ AUTO-CLEAR ERROR KAPAG NAG-TYPE ULIT
  const handleOtpChange = (newOtp) => {
    setOtp(newOtp);
    if (resetErrors.otp) {
      setResetErrors((prev) => ({ ...prev, otp: null }));
    }
  };

  // 👇 INAYOS NA NG TULUYAN: Tinanggal ang backend API call rito para 
  // hindi masunog ang OTP nang maaga!
  const doProceedToPassword = () => {
    if (!isValidOtp(otp)) {
      setResetErrors({ otp: 'Please enter the full 8-digit code.' });
      return;
    }
    
    // Ililipat na agad natin sa Password Screen nang hindi tine-test sa database.
    // Kapag pinindot na ang "Save New Password", saka lang magv-verify.
    setResetErrors({});
    setView('set-password');
  };

  // ── Actions ──
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

  const doForgotPassword = async () => {
    const errs = {};
    if (!email || !isValidEmail(email)) errs.email = 'Please enter a valid email address.';
    setForgotErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setForgotPending(true);
    try {
      await authService.requestPasswordReset(email);
      setResetEmail(email);
      setOtp('');
      setNewPassword('');
      setConfirmPassword('');
      setResetErrors({});
      setInfoMessage(`We sent an 8-digit code to ${email}. It expires shortly, so enter it soon.`);
      setResendCooldown(30);
      setView('verify-otp');
    } catch (err) {
      setForgotErrors({ email: err.message || 'Failed to send reset code.' });
    } finally {
      setForgotPending(false);
    }
  };

  const doResendCode = async () => {
    if (resendCooldown > 0) return;
    setForgotPending(true);
    try {
      await authService.requestPasswordReset(resetEmail);
      setInfoMessage(`We sent a new code to ${resetEmail}.`);
      setResendCooldown(30);
    } catch (err) {
      setResetErrors({ otp: err.message || 'Failed to resend code.' });
    } finally {
      setForgotPending(false);
    }
  };

  // Dito pa lang natin ipapadala yung OTP + Password para isahan lang ang checking
  const doResetPassword = async () => {
    const errs = {};
    const pwIssues = passwordIssues(newPassword);
    if (pwIssues.length > 0) errs.newPassword = `Password must have ${pwIssues.join(', ')}.`;

    if (!confirmPassword) errs.confirmPassword = 'Please confirm your new password.';
    else if (newPassword !== confirmPassword) errs.confirmPassword = 'Passwords do not match.';

    setResetErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setResetPending(true);
    try {
      await authService.resetPasswordWithOtp(resetEmail, otp, newPassword);
      setEmail(resetEmail);
      setPassword('');
      setOtp('');
      setNewPassword('');
      setConfirmPassword('');
      setInfoMessage('Password reset successful. You can now log in with your new password.');
      setView('login');
    } catch (err) {
      setView('verify-otp'); 
      setResetErrors({ otp: err.message || 'Invalid or expired code.' });
    } finally {
      setResetPending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key !== 'Enter') return;
    if (view === 'login') doLogin();
    else if (view === 'forgot') doForgotPassword();
    else if (view === 'verify-otp') doProceedToPassword();
    else if (view === 'set-password') doResetPassword();
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
    panelTitle: { color: '#0F172A', marginBottom: 6 },
    panelSub:   { color: '#64748B', marginBottom: 24, lineHeight: 1.6 },
  };

  // ── Copy per view ──
  const titles = {
    login:  { title: 'Welcome back', sub: 'Sign in to your admin account to continue.' },
    forgot: { title: 'Forgot password?', sub: "Enter your email and we'll send you an 8-digit code to reset your password." },
    'verify-otp': { title: 'Enter reset code', sub: `Check ${resetEmail} for the 8-digit code we sent.` },
    'set-password': { title: 'Set new password', sub: 'Create a new, secure password for your account.' },
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

        .panel-title { font-size: clamp(17px, 2.2vw, 22px); font-weight: 700; margin: 0 0 6px; }
        .panel-sub   { font-size: clamp(13px, 1.4vw, 14px); margin: 0 0 20px; }

        /* ── RESPONSIVE CLASSES ──
           Ginagamit ang % / clamp() sa halip na fixed px, para hindi biglaan
           (sudden jump) ang sukat sa pagitan ng mobile at desktop breakpoint —
           dahan-dahan itong lumiliit/lumalaki habang nag-re-resize ang window,
           kaya walang "sandwiched"/hindi-pantay na sukat sa mga in-between
           (tablet-width) na screens. */
        .responsive-card {
          display: flex;
          flex-direction: row;
          min-height: 700px;
          margin: 24px 16px;
        }
        .responsive-brand {
          width: 42%;
          min-width: 280px;
          padding: clamp(20px, 4vw, 48px) clamp(16px, 3vw, 32px);
          box-sizing: border-box;
        }
        .responsive-logo {
          width: clamp(96px, 20vw, 300px);
          height: auto;
          margin-bottom: clamp(8px, 1.5vw, 20px);
        }
        .responsive-title {
          font-size: clamp(15px, 1.8vw, 22px);
        }
        .responsive-form {
          flex: 1 1 0%;
          min-width: 0;
          padding: clamp(20px, 4vw, 48px) clamp(18px, 4vw, 44px);
          box-sizing: border-box;
        }

        /* ── SA MOBILE, NAGIGING STACKED (column) na layout ── */
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
            min-width: 0;
          }
          .panel-sub { margin-bottom: 16px; }
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
            <h1 style={S.panelTitle} className="panel-title">{titles[view].title}</h1>
            <p style={S.panelSub} className="panel-sub">{titles[view].sub}</p>

            {infoMessage && <Banner>{infoMessage}</Banner>}

            {/* ── LOGIN VIEW ── */}
            {view === 'login' && (
              <>
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

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
                  <LinkBtn onClick={goToForgot}>Forgot password?</LinkBtn>
                </div>

                <PrimaryBtn onClick={doLogin} disabled={loginPending}>
                  <IconSignIn /> {loginPending ? 'Signing in...' : 'Sign in'}
                </PrimaryBtn>
              </>
            )}

            {/* ── FORGOT PASSWORD VIEW ── */}
            {view === 'forgot' && (
              <>
                <Field label="Email Address" error={forgotErrors.email}>
                  <InputField
                    icon={IconMail}
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="@gmail.com"
                    autoComplete="email"
                    error={forgotErrors.email}
                  />
                </Field>

                <div style={{ height: 6 }} />

                <PrimaryBtn onClick={doForgotPassword} disabled={forgotPending}>
                  {forgotPending ? 'Sending code...' : 'Send Reset Code'}
                </PrimaryBtn>

                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
                  <LinkBtn onClick={goToLogin}><IconArrowLeft /> Back to Sign in</LinkBtn>
                </div>
              </>
            )}

            {/* ── STEP 1: VERIFY OTP VIEW (WITH BOX INPUTS) ── */}
            {view === 'verify-otp' && (
              <>
                <Field label="8-Digit Code" error={resetErrors.otp} hint="Check your inbox (and spam folder).">
                  <OtpBoxInput 
                    length={8} 
                    value={otp} 
                    onChange={handleOtpChange} 
                    error={resetErrors.otp} 
                  />
                </Field>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
                  <LinkBtn onClick={doResendCode} disabled={forgotPending || resendCooldown > 0}>
                    {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
                  </LinkBtn>
                </div>

                <PrimaryBtn onClick={doProceedToPassword}>
                  Verify Code
                </PrimaryBtn>

                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
                  <LinkBtn onClick={goToLogin}><IconArrowLeft /> Back to Sign in</LinkBtn>
                </div>
              </>
            )}

            {/* ── STEP 2: SET NEW PASSWORD VIEW ── */}
            {view === 'set-password' && (
              <>
                <Field label="New Password" error={resetErrors.newPassword} hint="At least 8 characters, with uppercase, lowercase, and a number.">
                  <InputField
                    icon={IconLock}
                    type={showNewPw ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    error={resetErrors.newPassword}
                  >
                    <TogglePwBtn shown={showNewPw} onToggle={() => setShowNewPw(v => !v)} />
                  </InputField>
                </Field>

                <Field label="Confirm New Password" error={resetErrors.confirmPassword}>
                  <InputField
                    icon={IconLock}
                    type={showConfirmPw ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    error={resetErrors.confirmPassword}
                  >
                    <TogglePwBtn shown={showConfirmPw} onToggle={() => setShowConfirmPw(v => !v)} />
                  </InputField>
                </Field>

                <PrimaryBtn onClick={doResetPassword} disabled={resetPending}>
                  {resetPending ? 'Saving...' : 'Save New Password'}
                </PrimaryBtn>

                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
                  <LinkBtn onClick={() => setView('verify-otp')}><IconArrowLeft /> Back to OTP</LinkBtn>
                </div>
              </>
            )}
            
          </div>
        </div>

      </div>
    </div>
  );
}
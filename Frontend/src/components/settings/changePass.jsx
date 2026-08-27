import { useState } from 'react';
import { Lock, Eye, EyeOff, CheckCircle2, AlertCircle } from 'lucide-react';

// ─── Password strength helper ──────────────────────────────────
// Purely visual/UX feedback for now — no backend to validate against yet.
function getStrength(pw) {
  if (!pw) return { label: '', pct: 0, color: 'bg-brand-200' };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;

  if (score <= 1) return { label: 'Weak', pct: 25, color: 'bg-red-400' };
  if (score <= 2) return { label: 'Fair', pct: 50, color: 'bg-amber-400' };
  if (score <= 3) return { label: 'Good', pct: 75, color: 'bg-brand-400' };
  return { label: 'Strong', pct: 100, color: 'bg-green-500' };
}

// Small field wrapper so the three password inputs stay identical
function PasswordField({ label, value, onChange, show, onToggleShow, placeholder, error }) {
  return (
    <div>
      <label className="block text-[13px] font-semibold text-brand-700 mb-1.5">{label}</label>
      <div className="relative">
        <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-300" />
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete="new-password"
          className={
            `w-full pl-10 pr-10 py-2.5 rounded-xl border text-[14px] text-brand-800 placeholder:text-brand-300 ` +
            `focus:outline-none focus:ring-2 focus:ring-brand-300 transition-colors ` +
            (error ? 'border-red-300 focus:ring-red-200' : 'border-brand-200')
          }
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={onToggleShow}
          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-brand-300 hover:text-brand-500 transition-colors"
        >
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
      {error && <p className="text-[11.5px] text-red-500 mt-1 font-medium">{error}</p>}
    </div>
  );
}

export default function ChangePass() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const strength = getStrength(newPassword);

  const validate = () => {
    const next = {};
    if (!currentPassword) next.currentPassword = 'Enter your current password.';
    if (!newPassword) {
      next.newPassword = 'Enter a new password.';
    } else if (newPassword.length < 8) {
      next.newPassword = 'Password must be at least 8 characters.';
    }
    if (currentPassword && newPassword && currentPassword === newPassword) {
      next.newPassword = 'New password must be different from the current one.';
    }
    if (!confirmPassword) {
      next.confirmPassword = 'Confirm your new password.';
    } else if (confirmPassword !== newPassword) {
      next.confirmPassword = 'Passwords do not match.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSuccessMsg('');
    if (!validate()) return;

    setSubmitting(true);
    // TODO: walang backend pa — palitan ito ng tunay na API call
    // (hal. authService.changePassword({ currentPassword, newPassword }))
    await new Promise((res) => setTimeout(res, 900));
    setSubmitting(false);

    setSuccessMsg('Password updated successfully.');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setErrors({});
  };

  return (
    <div className="bg-white border border-brand-200 rounded-2xl shadow-sm max-w-xl">
      <div className="px-5 md:px-6 py-4 border-b border-brand-100">
        <h2 className="font-serif text-[17px] font-bold text-brand-800">Change Password</h2>
        <p className="text-[12.5px] text-brand-400 mt-0.5">
          Choose a strong password you don't use anywhere else.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="px-5 md:px-6 py-5 flex flex-col gap-4">
        <PasswordField
          label="Current Password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          show={showCurrent}
          onToggleShow={() => setShowCurrent((v) => !v)}
          placeholder="Enter current password"
          error={errors.currentPassword}
        />

        <div>
          <PasswordField
            label="New Password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            show={showNew}
            onToggleShow={() => setShowNew((v) => !v)}
            placeholder="Enter new password"
            error={errors.newPassword}
          />

          {newPassword && (
            <div className="mt-2">
              <div className="h-1.5 w-full rounded-full bg-brand-100 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${strength.color}`}
                  style={{ width: `${strength.pct}%` }}
                />
              </div>
              <p className="text-[11px] text-brand-400 mt-1 font-medium">{strength.label}</p>
            </div>
          )}
        </div>

        <PasswordField
          label="Confirm New Password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          show={showConfirm}
          onToggleShow={() => setShowConfirm((v) => !v)}
          placeholder="Re-enter new password"
          error={errors.confirmPassword}
        />

        {successMsg && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 text-[13px] font-semibold rounded-xl px-3.5 py-2.5">
            <CheckCircle2 size={16} />
            {successMsg}
          </div>
        )}

        {!successMsg && Object.keys(errors).length > 0 && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-[13px] font-semibold rounded-xl px-3.5 py-2.5">
            <AlertCircle size={16} />
            Please fix the errors above.
          </div>
        )}

        <div className="flex justify-end pt-1">
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2.5 text-sm font-semibold rounded-xl bg-brand-700 text-white hover:bg-brand-800 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Updating…' : 'Update Password'}
          </button>
        </div>
      </form>
    </div>
  );
}
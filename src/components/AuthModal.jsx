import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth.jsx';

// Sign in / Sign up pop-up. Uses the native <dialog> element, which handles
// focus trapping and the Escape key for us.
export default function AuthModal({ open, mode, onModeChange, onClose, message }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="auth-modal"
      aria-labelledby="auth-title"
      onClose={onClose}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose(); // click on the backdrop
      }}
    >
      {open && (
        <div className="auth-body">
          <div className="auth-head">
            <div className="brand login-brand">
              <div className="brand-mark brand-mark-sm">P</div>
              <div className="brand-name">ParkSpot</div>
            </div>
            <button type="button" className="close-btn" aria-label="Close" onClick={onClose}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <div className="auth-tabs" role="tablist" aria-label="Account">
            <button type="button" role="tab" aria-selected={mode === 'signin'} className={`auth-tab${mode === 'signin' ? ' is-active' : ''}`} onClick={() => onModeChange('signin')}>
              Sign in
            </button>
            <button type="button" role="tab" aria-selected={mode === 'signup'} className={`auth-tab${mode === 'signup' ? ' is-active' : ''}`} onClick={() => onModeChange('signup')}>
              Sign up
            </button>
          </div>

          {message && <div className="auth-message">{message}</div>}

          {mode === 'signin' ? (
            <SignInForm onDone={onClose} onSwitch={() => onModeChange('signup')} />
          ) : (
            <SignUpForm onDone={onClose} onSwitch={() => onModeChange('signin')} />
          )}
        </div>
      )}
    </dialog>
  );
}

function SignInForm({ onDone, onSwitch }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email.trim(), password, remember);
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      <h2 id="auth-title" className="auth-title">Welcome back</h2>
      <label className="form-field">
        <span>Email</span>
        <input type="email" autoComplete="email" autoFocus value={email} onChange={(e) => { setEmail(e.target.value); setError(''); }} />
      </label>
      <label className="form-field">
        <span>Password</span>
        <input type="password" autoComplete="current-password" value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }} />
      </label>
      <div className="login-row">
        <label className="check">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Keep me signed in
        </label>
        <a href="#forgot" onClick={(e) => { e.preventDefault(); alert('Connect this to your auth service’s password reset.'); }}>
          Forgot password?
        </a>
      </div>
      {error && <div className="field-error" role="alert">{error}</div>}
      <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      <p className="muted small auth-switch">
        New here? <button type="button" className="btn-inline" onClick={onSwitch}>Create an account</button>
      </p>
    </form>
  );
}

function SignUpForm({ onDone, onSwitch }) {
  const { signup } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => { setForm({ ...form, [k]: e.target.value }); setError(''); };

  async function handleSubmit(e) {
    e.preventDefault();
    if (form.password !== form.confirm) return setError('Passwords do not match.');
    setError('');
    setBusy(true);
    try {
      await signup(form.name.trim(), form.email.trim(), form.password);
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      <h2 id="auth-title" className="auth-title">Create your account</h2>
      <label className="form-field">
        <span>Full name</span>
        <input type="text" autoComplete="name" autoFocus value={form.name} onChange={set('name')} />
      </label>
      <label className="form-field">
        <span>Email</span>
        <input type="email" autoComplete="email" value={form.email} onChange={set('email')} />
      </label>
      <label className="form-field">
        <span>Password</span>
        <input type="password" autoComplete="new-password" value={form.password} onChange={set('password')} aria-describedby="pw-hint" />
        <span id="pw-hint" className="muted small" style={{ fontWeight: 400 }}>At least 8 characters.</span>
      </label>
      <label className="form-field">
        <span>Confirm password</span>
        <input type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} />
      </label>
      {error && <div className="field-error" role="alert">{error}</div>}
      <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Creating account…' : 'Sign up'}</button>
      <p className="muted small auth-switch">
        Already have an account? <button type="button" className="btn-inline" onClick={onSwitch}>Sign in</button>
      </p>
    </form>
  );
}

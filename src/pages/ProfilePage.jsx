import { useState } from 'react';
import { initials, useAuth } from '../auth.jsx';

export default function ProfilePage() {
  const { user, updateProfile, changePassword } = useAuth();
  const [form, setForm] = useState({ name: user.name, email: user.email, phone: user.phone || '' });
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwStatus, setPwStatus] = useState('');
  const [pwError, setPwError] = useState('');

  const set = (k) => (e) => {
    setForm({ ...form, [k]: e.target.value });
    setStatus('');
    setError('');
  };

  async function saveProfile(e) {
    e.preventDefault();
    if (!form.name.trim()) return setError('Name is required.');
    if (!form.email.includes('@')) return setError('Enter a valid email address.');
    await updateProfile({ name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim() });
    setStatus('Profile saved.');
  }

  async function savePassword(e) {
    e.preventDefault();
    setPwStatus('');
    setPwError('');
    if (pw.next !== pw.confirm) return setPwError('New passwords do not match.');
    try {
      await changePassword(pw.current, pw.next);
      setPw({ current: '', next: '', confirm: '' });
      setPwStatus('Password updated.');
    } catch (err) {
      setPwError(err.message);
    }
  }

  return (
    <div className="page-stack">
      <header>
        <div className="muted small">Account</div>
        <h1>Profile</h1>
      </header>

      <form className="card form-card" onSubmit={saveProfile} noValidate>
        <div className="profile-hero">
          <span className="avatar avatar-xl" aria-hidden="true">{initials(form.name || user.name)}</span>
          <div>
            <div className="profile-hero-name">{form.name || user.name}</div>
            <div className="muted small">{user.role}</div>
          </div>
        </div>
        <h2>Personal details</h2>
        <div className="form-grid">
          <label className="form-field">
            <span>Full name</span>
            <input type="text" autoComplete="name" value={form.name} onChange={set('name')} />
          </label>
          <label className="form-field">
            <span>Email</span>
            <input type="email" autoComplete="email" value={form.email} onChange={set('email')} />
          </label>
          <label className="form-field">
            <span>Phone</span>
            <input type="tel" autoComplete="tel" placeholder="Optional" value={form.phone} onChange={set('phone')} />
          </label>
          <label className="form-field">
            <span>Role</span>
            <input type="text" value={user.role} readOnly aria-readonly="true" className="is-readonly" />
          </label>
        </div>
        {error && <div className="field-error" role="alert">{error}</div>}
        <div className="form-actions">
          {status && <span className="form-ok" role="status">{status}</span>}
          <button type="submit" className="btn-primary">Save changes</button>
        </div>
      </form>

      <form className="card form-card" onSubmit={savePassword} noValidate>
        <h2>Change password</h2>
        <div className="form-grid">
          <label className="form-field">
            <span>Current password</span>
            <input type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
          </label>
          <span className="only-desktop-block" />
          <label className="form-field">
            <span>New password</span>
            <input type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
          </label>
          <label className="form-field">
            <span>Confirm new password</span>
            <input type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
          </label>
        </div>
        {pwError && <div className="field-error" role="alert">{pwError}</div>}
        <div className="form-actions">
          {pwStatus && <span className="form-ok" role="status">{pwStatus}</span>}
          <button type="submit" className="btn-outline btn-pad">Update password</button>
        </div>
      </form>
    </div>
  );
}

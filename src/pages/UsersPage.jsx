import { useEffect, useState } from 'react';
import PhoneInput, { formatPhone } from '../components/PhoneInput.jsx';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import Modal from '../components/Modal.jsx';
import { money } from '../parking.jsx';

// Admin only: add, edit and delete accounts. The server refuses all of this
// from anyone who isn't an admin, and also stops an admin from changing their
// own role, deleting themselves, or removing the last admin.

const ROLES = ['Customer', 'Attendant', 'Admin'];
const ROLE_HELP = {
  Customer: 'Parks, reserves and pays for spots.',
  Attendant: 'Runs the lot: All spots, Reservations and Open spots. Cannot manage users or lot settings.',
  Admin: 'Everything, including users and lot settings.',
};
const BADGE = { Customer: 'badge-free', Attendant: 'badge-occupied', Admin: 'badge-reserved' };

function makePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint32Array(12));
  return Array.from(bytes, (n) => chars[n % chars.length]).join('');
}

function formatDate(iso, withTime = false) {
  if (!iso) return 'Never';
  const d = new Date(iso);
  const date = d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  return withTime ? `${date}, ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : date;
}

export default function UsersPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null); // the user being edited
  const [notice, setNotice] = useState('');

  async function load() {
    try {
      const d = await api('/admin/users');
      setUsers(d.users);
      setLoadError('');
    } catch (err) {
      setLoadError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const badge = (role) => <span className={`badge ${BADGE[role] ?? 'badge-free'}`}>{role}</span>;

  return (
    <div className="page-stack admin">
      <header className="page-header">
        <div>
          <div className="muted small">Administration</div>
          <h1>Users</h1>
          <p className="muted admin-blurb">Customers, attendants and admins.</p>
        </div>
        <button type="button" className="btn-primary btn-pad" onClick={() => setAdding(true)}>
          + Add user
        </button>
      </header>

      <section className="card admin-list" aria-labelledby="users-title">
        <div className="admin-toolbar">
          <h2 id="users-title">All users ({users.length})</h2>
        </div>
        {loadError && (
          <div className="field-error" role="alert">
            {loadError}
          </div>
        )}
        {notice && (
          <div className="admin-notice" role="status">
            <span>{notice}</span>
            <button type="button" className="notice-close" aria-label="Dismiss" onClick={() => setNotice('')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        )}

        <div className="table-wrap only-desktop-block">
          <table className="users-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Created</th>
                <th>Last sign-in</th>
                <th className="num">Pending charges</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    {u.name}
                    {u.id === me?.id && <span className="muted small"> (you)</span>}
                  </td>
                  <td className="cell-email">{u.email}</td>
                  <td>{badge(u.role)}</td>
                  <td>{formatDate(u.createdAt)}</td>
                  <td>{formatDate(u.lastLoginAt, true)}</td>
                  <td className="num mono">{money(u.balanceCents)}</td>
                  <td className="cell-action">
                    <button type="button" className="btn-outline btn-sm" aria-label={`Edit ${u.name}`} onClick={() => setEditing(u)}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ul className="admin-cards only-mobile-block">
          {users.map((u) => (
            <li key={u.id} className="admin-card">
              <div className="admin-card-top">
                <span className="users-card-name">
                  {u.name}
                  {u.id === me?.id && <span className="muted small"> (you)</span>}
                </span>
                {badge(u.role)}
              </div>
              <div className="muted small">{u.email}</div>
              <div className="muted small">Last sign-in: {formatDate(u.lastLoginAt, true)}</div>
              <div className="muted small">
                Created {formatDate(u.createdAt)} · Pending <span className="mono">{money(u.balanceCents)}</span>
              </div>
              <button type="button" className="btn-outline btn-sm" aria-label={`Edit ${u.name}`} onClick={() => setEditing(u)}>
                Edit
              </button>
            </li>
          ))}
        </ul>
      </section>

      <Modal open={adding} title="Add a user" onClose={() => setAdding(false)}>
        {adding && (
          <AddUser
            onAdded={async (msg) => {
              setNotice(msg);
              await load();
            }}
            onClose={() => setAdding(false)}
          />
        )}
      </Modal>

      <Modal open={Boolean(editing)} title={editing ? `Edit ${editing.name}` : ''} onClose={() => setEditing(null)}>
        {editing && (
          <EditUser
            key={editing.id}
            user={editing}
            isMe={editing.id === me?.id}
            onDone={async (msg) => {
              setEditing(null);
              setNotice(msg);
              await load();
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>
    </div>
  );
}

function PasswordField({ id, label, value, onChange, hint }) {
  const [show, setShow] = useState(false);
  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      <div className="password-row">
        <input id={id} type={show ? 'text' : 'password'} autoComplete="new-password" value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={`${id}-hint`} />
        <button
          type="button"
          className="btn-outline btn-sm"
          onClick={() => {
            onChange(makePassword());
            setShow(true);
          }}
        >
          Generate
        </button>
      </div>
      <span id={`${id}-hint`} className="muted small field-hint">
        {hint}
      </span>
    </div>
  );
}

function RoleField({ id, value, onChange, disabled, note }) {
  return (
    <label className="form-field">
      <span>Role</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} aria-describedby={`${id}-hint`}>
        {ROLES.map((r) => (
          <option key={r}>{r}</option>
        ))}
      </select>
      <span id={`${id}-hint`} className="muted small field-hint">
        {note ?? ROLE_HELP[value]}
      </span>
    </label>
  );
}

function AddUser({ onAdded, onClose }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', role: 'Customer', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);
  const set = (k) => (e) => {
    setForm({ ...form, [k]: e.target.value });
    setError('');
  };

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) return setError('Enter a name.');
    if (!form.email.includes('@')) return setError('Enter a valid email address.');
    if (form.password.length < 8) return setError('Password must be at least 8 characters.');
    setBusy(true);
    try {
      const d = await api('/admin/users', { method: 'POST', body: form });
      setCreated({ email: d.user.email, role: d.user.role, password: form.password });
      await onAdded(`${d.user.role} account created for ${d.user.email}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <>
        <div className="created-note" role="status">
          {created.role} account created for <strong>{created.email}</strong>.
          <br />
          Temporary password: <span className="mono">{created.password}</span>
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          Share the password with them. They can change it under Profile.
        </p>
        <div className="confirm-actions">
          <button type="button" className="btn-primary btn-pad" onClick={onClose}>
            Done
          </button>
          <button
            type="button"
            className="btn-outline btn-pad"
            onClick={() => {
              setCreated(null);
              setForm({ name: '', email: '', phone: '', role: 'Customer', password: '' });
            }}
          >
            Add another
          </button>
        </div>
      </>
    );
  }

  return (
    <form className="auth-form" onSubmit={submit} noValidate>
      <label className="form-field">
        <span>Full name</span>
        <input type="text" autoComplete="off" autoFocus value={form.name} onChange={set('name')} />
      </label>
      <label className="form-field">
        <span>Email</span>
        <input type="email" autoComplete="off" value={form.email} onChange={set('email')} />
      </label>
      <label className="form-field">
        <span>Phone (optional)</span>
        <PhoneInput autoComplete="off" value={form.phone} onChange={(phone) => setForm({ ...form, phone })} />
      </label>
      <RoleField id="add-role" value={form.role} onChange={(v) => setForm({ ...form, role: v })} />
      <PasswordField
        id="add-password"
        label="Temporary password"
        value={form.password}
        onChange={(v) => {
          setForm({ ...form, password: v });
          setError('');
        }}
        hint="At least 8 characters."
      />
      {error && (
        <div className="field-error" role="alert">
          {error}
        </div>
      )}
      <button type="submit" className="btn-primary" disabled={busy}>
        {busy ? 'Adding…' : 'Add user'}
      </button>
    </form>
  );
}

function EditUser({ user, isMe, onDone, onCancel }) {
  const [form, setForm] = useState({ name: user.name, email: user.email, phone: formatPhone(user.phone), role: user.role, password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (k) => (e) => {
    setForm({ ...form, [k]: e.target.value });
    setError('');
  };

  async function save(e) {
    e.preventDefault();
    if (!form.name.trim()) return setError('Name is required.');
    if (!form.email.includes('@')) return setError('Enter a valid email address.');
    if (form.password && form.password.length < 8) return setError('Password must be at least 8 characters.');
    const changes = {};
    if (form.name.trim() !== user.name) changes.name = form.name.trim();
    if (form.email.trim().toLowerCase() !== user.email) changes.email = form.email.trim();
    if (form.phone.trim() !== (user.phone || '')) changes.phone = form.phone.trim();
    if (form.role !== user.role) changes.role = form.role;
    if (form.password) changes.password = form.password;
    if (!Object.keys(changes).length) return onCancel();
    setBusy(true);
    try {
      await api(`/admin/users/${user.id}`, { method: 'PATCH', body: changes });
      const parts = [];
      if (changes.name || changes.email || 'phone' in changes) parts.push('details updated');
      if (changes.role) parts.push(`role is now ${changes.role}`);
      if (changes.password) parts.push(`password reset to ${form.password} (signed out everywhere)`);
      await onDone(`${changes.name ?? user.name}: ${parts.join('; ')}.`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api(`/admin/users/${user.id}`, { method: 'DELETE' });
      await onDone(`${user.name} (${user.email}) was deleted. Their past parking and payment records are kept.`);
    } catch (err) {
      setError(err.message);
      setConfirmDelete(false);
      setBusy(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={save} noValidate>
      <p className="muted small" style={{ margin: 0 }}>
        Last sign-in: {formatDate(user.lastLoginAt, true)} · Created {formatDate(user.createdAt)}
      </p>
      <label className="form-field">
        <span>Full name</span>
        <input type="text" value={form.name} onChange={set('name')} />
      </label>
      <label className="form-field">
        <span>Email</span>
        <input type="email" value={form.email} onChange={set('email')} />
      </label>
      <label className="form-field">
        <span>Phone</span>
        <PhoneInput value={form.phone} onChange={(phone) => setForm({ ...form, phone })} />
      </label>
      <RoleField
        id={`edit-role-${user.id}`}
        value={form.role}
        onChange={(v) => setForm({ ...form, role: v })}
        disabled={isMe}
        note={isMe ? "You can't change your own role." : undefined}
      />
      <PasswordField
        id={`reset-password-${user.id}`}
        label="New password"
        value={form.password}
        onChange={(v) => {
          setForm({ ...form, password: v });
          setError('');
        }}
        hint="Leave empty to keep the current password. A new password signs them out everywhere."
      />
      {error && (
        <div className="field-error" role="alert">
          {error}
        </div>
      )}

      {confirmDelete ? (
        <div className="confirm-box danger" role="group" aria-label="Confirm delete">
          <span>
            Delete {user.name}? This can't be undone. Their past parking and payment records are kept.
          </span>
          <div className="confirm-actions">
            <button type="button" className="btn-danger btn-pad" disabled={busy} onClick={remove}>
              Yes, delete
            </button>
            <button type="button" className="btn-outline btn-pad" disabled={busy} onClick={() => setConfirmDelete(false)}>
              Keep
            </button>
          </div>
        </div>
      ) : (
        <div className="modal-actions">
          {!isMe && (
            <button type="button" className="btn-link user-delete" onClick={() => setConfirmDelete(true)}>
              Delete user
            </button>
          )}
          <button type="button" className="btn-outline btn-pad" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn-primary btn-pad" disabled={busy}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      )}
    </form>
  );
}

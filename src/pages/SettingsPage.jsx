import { useState } from 'react';
import { isStaff, useAuth } from '../auth.jsx';
import MyCars from '../components/MyCars.jsx';
import { useParkingStore } from '../parking.jsx';
import { useSettings } from '../settings.jsx';

// Customers: My cars, default level, display and their notifications.
// Attendants: display and notifications.
// Admins: the same; lot details and layout are on the Manage Parking Lot page.
export default function SettingsPage() {
  const { user } = useAuth();
  const staff = isStaff(user);
  const { settings, updateSettings, resetSettings } = useSettings();
  const { floors } = useParkingStore();
  const [form, setForm] = useState(settings);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setStatus('');
  };

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      updateSettings(form);
      setStatus('Settings saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function handleReset() {
    resetSettings();
    window.location.reload();
  }

  const levelField = (
    <label className="form-field">
      <span>Default level</span>
      <select value={form.defaultLevel} onChange={(e) => set('defaultLevel', e.target.value)} aria-describedby="level-hint">
        {floors.map((f) => (
          <option key={f.code} value={f.code}>
            {f.name}
          </option>
        ))}
      </select>
      <span id="level-hint" className="muted small field-hint">
        The level the Overview opens on.
      </span>
    </label>
  );

  return (
    <div className="page-stack">
      <header>
        <div className="muted small">Account</div>
        <h1>Settings</h1>
      </header>

      {/* Customers manage the plates they can check in and reserve with. */}
      {!staff && <MyCars />}

      <form className="page-stack" onSubmit={handleSubmit} noValidate>
        {/* Admins edit the lot's name, address, rate and layout under Manage Parking Lot. */}
        {!staff && (
          <section className="card form-card">
            <h2>Parking</h2>
            <div className="form-grid">{levelField}</div>
          </section>
        )}

        <section className="card form-card">
          <h2>Display</h2>
          <fieldset className="radio-group">
            <legend>Time format</legend>
            <label className="check">
              <input type="radio" name="timeFormat" checked={form.timeFormat === '24h'} onChange={() => set('timeFormat', '24h')} />
              24-hour (14:30)
            </label>
            <label className="check">
              <input type="radio" name="timeFormat" checked={form.timeFormat === '12h'} onChange={() => set('timeFormat', '12h')} />
              12-hour (2:30 PM)
            </label>
          </fieldset>
        </section>

        <section className="card form-card">
          <h2>Notifications</h2>
          {/* New-reservation alerts are for staff only. */}
          {staff && (
            <label className="toggle-row">
              <span>
                <span className="toggle-title">New reservations</span>
                <span className="muted small">Alert when a driver reserves a spot.</span>
              </span>
              <input type="checkbox" className="switch" checked={form.notifyReservations} onChange={(e) => set('notifyReservations', e.target.checked)} />
            </label>
          )}
          <label className="toggle-row">
            <span>
              <span className="toggle-title">Level full</span>
              <span className="muted small">Alert when a level has no open spots.</span>
            </span>
            <input type="checkbox" className="switch" checked={form.notifyLotFull} onChange={(e) => set('notifyLotFull', e.target.checked)} />
          </label>
          <label className="toggle-row">
            <span>
              <span className="toggle-title">Daily email summary</span>
              <span className="muted small">{staff ? 'Occupancy and payments, sent each evening.' : 'Your parking and payments, sent each evening.'}</span>
            </span>
            <input type="checkbox" className="switch" checked={form.notifyEmailSummary} onChange={(e) => set('notifyEmailSummary', e.target.checked)} />
          </label>
        </section>

        <div className="form-actions">
          <button type="button" className="btn-link" onClick={handleReset}>
            Reset to defaults
          </button>
          {error && (
            <span className="field-error" role="alert">
              {error}
            </span>
          )}
          {status && (
            <span className="form-ok" role="status">
              {status}
            </span>
          )}
          <button type="submit" className="btn-primary btn-pad" disabled={busy}>
            {busy ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </form>
    </div>
  );
}

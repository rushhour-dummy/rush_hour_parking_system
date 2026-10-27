import { useState } from 'react';
import { LEVELS } from '../data.js';
import { useSettings } from '../settings.jsx';

export default function SettingsPage() {
  const { settings, updateSettings, resetSettings } = useSettings();
  const [form, setForm] = useState(settings);
  const [status, setStatus] = useState('');

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setStatus('');
  };

  function handleSubmit(e) {
    e.preventDefault();
    updateSettings(form);
    setStatus('Settings saved.');
  }

  function handleReset() {
    resetSettings();
    window.location.reload();
  }

  return (
    <form className="page-stack" onSubmit={handleSubmit} noValidate>
      <header>
        <div className="muted small">Account</div>
        <h1>Settings</h1>
      </header>

      <section className="card form-card">
        <h2>Parking lot</h2>
        <div className="form-grid">
          <label className="form-field">
            <span>Lot name</span>
            <input type="text" value={form.lotName} onChange={(e) => set('lotName', e.target.value)} />
          </label>
          <label className="form-field">
            <span>Address</span>
            <input type="text" value={form.address} onChange={(e) => set('address', e.target.value)} />
          </label>
          <label className="form-field">
            <span>Hourly rate</span>
            <input type="text" inputMode="decimal" placeholder="e.g. 3.50" value={form.hourlyRate} onChange={(e) => set('hourlyRate', e.target.value)} />
          </label>
          <label className="form-field">
            <span>Default level</span>
            <select value={form.defaultLevel} onChange={(e) => set('defaultLevel', e.target.value)}>
              {LEVELS.map((lv) => (
                <option key={lv} value={lv}>Level {lv.slice(1)}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

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
        <label className="toggle-row">
          <span>
            <span className="toggle-title">New reservations</span>
            <span className="muted small">Alert when a driver reserves a spot.</span>
          </span>
          <input type="checkbox" className="switch" checked={form.notifyReservations} onChange={(e) => set('notifyReservations', e.target.checked)} />
        </label>
        <label className="toggle-row">
          <span>
            <span className="toggle-title">Level full</span>
            <span className="muted small">Alert when a level has no free spots.</span>
          </span>
          <input type="checkbox" className="switch" checked={form.notifyLotFull} onChange={(e) => set('notifyLotFull', e.target.checked)} />
        </label>
        <label className="toggle-row">
          <span>
            <span className="toggle-title">Daily email summary</span>
            <span className="muted small">Occupancy and payments, sent each evening.</span>
          </span>
          <input type="checkbox" className="switch" checked={form.notifyEmailSummary} onChange={(e) => set('notifyEmailSummary', e.target.checked)} />
        </label>
      </section>

      <div className="form-actions">
        <button type="button" className="btn-link" onClick={handleReset}>Reset to defaults</button>
        {status && <span className="form-ok" role="status">{status}</span>}
        <button type="submit" className="btn-primary btn-pad">Save settings</button>
      </div>
    </form>
  );
}

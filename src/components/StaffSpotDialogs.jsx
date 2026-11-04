import { useEffect, useState } from 'react';
import { durationOptions, formatHours, formatTime, money, priceCents, useParkingStore } from '../parking.jsx';
import { useSettings } from '../settings.jsx';
import Modal from './Modal.jsx';

// Staff pop-ups on the Reservations page: edit a reservation, or add paid time
// to an occupied spot.

const pad = (n) => String(n).padStart(2, '0');
const toLocalInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

export function EditReservationDialog({ spot, onClose, onSave }) {
  const { hourlyRate: rate, rules } = useParkingStore();
  const { settings } = useSettings();
  const [arrival, setArrival] = useState('');
  const [hours, setHours] = useState(1);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!spot) return;
    setArrival(spot.reservedForIso ? toLocalInput(new Date(spot.reservedForIso)) : '');
    setHours(spot.reservedHours ?? 1);
    setError('');
    setBusy(false);
  }, [spot]);

  if (!spot) return <Modal open={false} title="" onClose={onClose} />;

  const now = new Date();
  const max = toLocalInput(new Date(now.getTime() + rules.maxHoursAhead * 3600000));
  const when = arrival ? new Date(arrival) : null;
  const newExpiry = when ? new Date(when.getTime() + rules.graceMinutes * 60000).toISOString() : null;
  const delta = rate != null ? priceCents(rate, hours - (spot.reservedHours ?? hours)) : 0;
  const newFee = Math.max(0, (spot.reservedAmountCents ?? 0) + delta);

  async function save(e) {
    e.preventDefault();
    if (!when || Number.isNaN(when.getTime())) return setError('Choose an arrival time.');
    const changes = {};
    if (toLocalInput(when) !== toLocalInput(new Date(spot.reservedForIso))) changes.reservedFor = when.toISOString();
    if (hours !== spot.reservedHours) changes.hours = hours;
    if (!Object.keys(changes).length) return onClose();
    setBusy(true);
    try {
      await onSave(changes);
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal open title={`Edit reservation · ${spot.id}`} onClose={() => !busy && onClose()}>
      <form className="auth-form" onSubmit={save} noValidate>
        <p className="muted small" style={{ margin: 0 }}>
          {spot.customerName || 'Customer'} · <span className="mono">{spot.plate}</span>
        </p>
        <div className="form-grid reserve-grid">
          <label className="form-field">
            <span>Arrival time</span>
            <input type="datetime-local" value={arrival} min={toLocalInput(now)} max={max} step={300} onChange={(e) => { setArrival(e.target.value); setError(''); }} />
          </label>
          <label className="form-field">
            <span>Length of stay</span>
            <select value={hours} onChange={(e) => setHours(Number(e.target.value))}>
              {durationOptions(rules.maxHours).map((h) => (
                <option key={h} value={h}>
                  {formatHours(h)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="reserve-summary">
          <div className="reserve-cost">
            <span>Expires (released if not checked in)</span>
            <strong>{newExpiry ? formatTime(newExpiry, settings.timeFormat) : '—'}</strong>
          </div>
          <div className="reserve-cost">
            <span>Fee (pending)</span>
            <strong>{money(newFee)}</strong>
          </div>
          {delta !== 0 && (
            <div className="muted small">
              {delta > 0 ? '+' : '−'}
              {money(Math.abs(delta))} from {spot.reservedAmountCents != null ? money(spot.reservedAmountCents) : '—'}
            </div>
          )}
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          Arrival can be up to {rules.maxHoursAhead === 1 ? '1 hour' : `${rules.maxHoursAhead} hours`} from now. The customer sees the change on their Reservations page.
        </p>
        {error && (
          <div className="field-error" role="alert">
            {error}
          </div>
        )}
        <div className="confirm-actions">
          <button type="submit" className="btn-primary btn-pad" disabled={busy}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
          <button type="button" className="btn-outline btn-pad" disabled={busy} onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function AddTimeDialog({ spot, onClose, onSave }) {
  const { hourlyRate: rate, rules } = useParkingStore();
  const { settings } = useSettings();
  const [hours, setHours] = useState(1);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!spot) return;
    setHours(1);
    setError('');
    setBusy(false);
  }, [spot]);

  if (!spot) return <Modal open={false} title="" onClose={onClose} />;

  const from = Math.max(spot.paidUntilMs ?? Date.now(), Date.now());
  const newUntil = new Date(from + hours * 3600000).toISOString();
  const cost = priceCents(rate, hours) ?? 0;

  async function save() {
    setBusy(true);
    setError('');
    try {
      await onSave(hours);
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal open title={`Add time · ${spot.id}`} onClose={() => !busy && onClose()}>
      <p className="muted small" style={{ margin: 0 }}>
        {spot.customerName || 'No customer account'} · <span className="mono">{spot.plate}</span> · parked {spot.timeLabel}
      </p>
      <label className="form-field">
        <span>Add</span>
        <select value={hours} onChange={(e) => setHours(Number(e.target.value))} disabled={busy}>
          {durationOptions(rules.maxHours).map((h) => (
            <option key={h} value={h}>
              +{formatHours(h)}
            </option>
          ))}
        </select>
      </label>
      <div className="reserve-summary">
        <div className="reserve-cost">
          <span>Paid until</span>
          <strong>{formatTime(newUntil, settings.timeFormat)}</strong>
        </div>
        <div className="muted small">Now {spot.paidUntil ? `paid until ${spot.paidUntil}` : 'no paid time'}.</div>
        <div className="reserve-cost">
          <span>Processed now</span>
          <strong>{money(cost)}</strong>
        </div>
        {rate != null && (
          <div className="muted small">
            {formatHours(hours)} × {money(Math.round(rate * 100))}/h
            {spot.customerName ? `, charged to ${spot.customerName}` : ''}
          </div>
        )}
      </div>
      {error && (
        <div className="field-error" role="alert">
          {error}
        </div>
      )}
      <div className="confirm-actions">
        <button type="button" className="btn-primary btn-pad" disabled={busy} onClick={save}>
          {busy ? 'Processing…' : `Add ${formatHours(hours)} for ${money(cost)}`}
        </button>
        <button type="button" className="btn-outline btn-pad" disabled={busy} onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}

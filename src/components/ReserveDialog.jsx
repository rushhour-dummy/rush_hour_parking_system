import { useEffect, useRef, useState } from 'react';
import { durationOptions, formatHours, money, priceCents } from '../parking.jsx';

// "Reserve this spot" pop-up: pick one of your cars, an arrival time and how long
// you'll park. The spot is held from now; the parking clock starts at check-in.

const pad = (n) => String(n).padStart(2, '0');
// <input type="datetime-local"> works in local time without a time zone.
function toLocalInput(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function defaultArrival() {
  const d = new Date(Date.now() + 15 * 60000);
  d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0); // next 5-minute mark
  return toLocalInput(d);
}

export default function ReserveDialog({ open, spotCode, cars, rate, rules, onClose, onReserve, onAddCar }) {
  const dialogRef = useRef(null);
  const freeCars = cars.filter((c) => !c.status);
  const [plate, setPlate] = useState('');
  const [arrival, setArrival] = useState(defaultArrival);
  const [hours, setHours] = useState(2);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) {
      setPlate(freeCars[0]?.plate ?? '');
      setArrival(defaultArrival());
      setHours(2);
      setError('');
      setBusy(false);
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const now = new Date();
  const min = toLocalInput(now);
  const max = toLocalInput(new Date(now.getTime() + rules.maxHoursAhead * 3600000));
  const costCents = priceCents(rate, hours);
  const hourOptions = durationOptions(rules.maxHours); // 15-minute steps

  async function handleSubmit(e) {
    e.preventDefault();
    if (!plate) return setError('Choose a car for this reservation.');
    const when = new Date(arrival);
    if (!arrival || Number.isNaN(when.getTime())) return setError('Choose an arrival time.');
    setError('');
    setBusy(true);
    try {
      await onReserve({ plate, reservedFor: when.toISOString(), hours });
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="auth-modal reserve-modal"
      aria-labelledby="reserve-title"
      onClose={onClose}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
    >
      {open && (
        <form className="auth-body" onSubmit={handleSubmit} noValidate>
          <div className="auth-head">
            <h2 id="reserve-title" className="auth-title">
              Reserve <span className="mono">{spotCode}</span>
            </h2>
            <button type="button" className="close-btn" aria-label="Close" onClick={onClose}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          {cars.length === 0 ? (
            <div className="reserve-empty">
              <p>Add a car to your account before reserving. You'll pick it here.</p>
              <button type="button" className="btn-primary btn-pad" onClick={onAddCar}>
                Add a car
              </button>
            </div>
          ) : freeCars.length === 0 ? (
            <div className="reserve-empty">
              <p>Each car can hold one spot, and all your cars are already parked or reserved.</p>
              <button type="button" className="btn-outline btn-pad" onClick={onAddCar}>
                Add another car
              </button>
            </div>
          ) : (
            <>
              <label className="form-field">
                <span>Car</span>
                <select value={plate} onChange={(e) => setPlate(e.target.value)}>
                  {cars.map((c) => (
                    <option key={c.id} value={c.plate} disabled={Boolean(c.status)}>
                      {c.plate}
                      {c.status ? ` · ${c.status} ${c.spot}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <div className="form-grid reserve-grid">
                <label className="form-field">
                  <span>Arrival time</span>
                  <input type="datetime-local" value={arrival} min={min} max={max} step={300} onChange={(e) => setArrival(e.target.value)} />
                </label>
                <label className="form-field">
                  <span>Length of stay</span>
                  <select value={hours} onChange={(e) => setHours(Number(e.target.value))}>
                    {hourOptions.map((h) => (
                      <option key={h} value={h}>
                        {formatHours(h)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="reserve-summary">
                <div className="reserve-cost">
                  <span>Reserved amount</span>
                  <strong>{costCents != null ? money(costCents) : 'Rate not set'}</strong>
                </div>
                {rate != null && (
                  <div className="muted small">
                    {formatHours(hours)} × {money(Math.round(rate * 100))}/h
                  </div>
                )}
              </div>
              <p className="muted small reserve-policy">
                You can reserve up to {rules.maxHoursAhead === 1 ? '1 hour' : `${rules.maxHoursAhead} hours`} ahead. The
                spot is held for you from now and the fee is added to your account as pending. It's processed when you check
                in, which is also when the parking clock starts. If you don't check in within {rules.graceMinutes} minutes of
                your arrival time, the spot is released and the full fee is processed.
              </p>

              {error && (
                <div className="field-error" role="alert">
                  {error}
                </div>
              )}
              <button type="submit" className="btn-primary" disabled={busy}>
                {busy ? 'Reserving…' : costCents != null ? `Reserve for ${money(costCents)}` : 'Reserve'}
              </button>
            </>
          )}
        </form>
      )}
    </dialog>
  );
}

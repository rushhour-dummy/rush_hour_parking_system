import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { durationOptions, formatHours, money, priceCents, useParkingStore } from '../parking.jsx';

// Staff: reserve a free spot for a registered customer, with one of their cars.
// Same rules as a customer's own reservation; the customer is charged for a no-show.

const pad = (n) => String(n).padStart(2, '0');
const toLocalInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
function defaultArrival() {
  const d = new Date(Date.now() + 15 * 60000);
  d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0);
  return toLocalInput(d);
}

export default function AdminReserveDialog({ open, spotCode, onClose, onReserve }) {
  const { hourlyRate: rate, rules } = useParkingStore();
  const dialogRef = useRef(null);
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [userId, setUserId] = useState('');
  const [cars, setCars] = useState(null); // null while loading
  const [vehicleId, setVehicleId] = useState('');
  const [arrival, setArrival] = useState(defaultArrival);
  const [hours, setHours] = useState(2);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Open: reset the form and load the customer list.
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) {
      setSearch('');
      setUserId('');
      setCars(null);
      setVehicleId('');
      setArrival(defaultArrival());
      setHours(2);
      setError('');
      setBusy(false);
      api('/admin/customers')
        .then((r) => setCustomers(r.customers))
        .catch((err) => setError(err.message));
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open]);

  // Customer chosen: load their cars and pick the first free one.
  useEffect(() => {
    if (!userId) return;
    setCars(null);
    setVehicleId('');
    api(`/admin/users/${userId}/vehicles`)
      .then((r) => {
        setCars(r.vehicles);
        const first = r.vehicles.find((v) => !v.status);
        setVehicleId(first ? String(first.id) : '');
      })
      .catch((err) => setError(err.message));
  }, [userId]);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter((c) => !q || c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q));
  }, [customers, search]);

  const now = new Date();
  const min = toLocalInput(now);
  const max = toLocalInput(new Date(now.getTime() + rules.maxHoursAhead * 3600000));
  const costCents = priceCents(rate, hours);
  const customer = customers.find((c) => String(c.id) === userId);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!userId) return setError('Choose a customer.');
    if (!vehicleId) return setError("Choose one of the customer's cars.");
    const when = new Date(arrival);
    if (!arrival || Number.isNaN(when.getTime())) return setError('Choose an arrival time.');
    setError('');
    setBusy(true);
    try {
      await onReserve({ userId: Number(userId), vehicleId: Number(vehicleId), reservedFor: when.toISOString(), hours });
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
      aria-labelledby="admin-reserve-title"
      onClose={onClose}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
    >
      {open && (
        <form className="auth-body" onSubmit={handleSubmit} noValidate>
          <div className="auth-head">
            <h2 id="admin-reserve-title" className="auth-title">
              Reserve <span className="mono">{spotCode}</span> for a customer
            </h2>
            <button type="button" className="close-btn" aria-label="Close" onClick={onClose}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <label className="form-field">
            <span>Find customer</span>
            <input type="search" placeholder="Name or email" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <label className="form-field">
            <span>Customer</span>
            <select value={userId} onChange={(e) => { setUserId(e.target.value); setError(''); }}>
              <option value="">{matches.length ? 'Choose a customer…' : 'No customers match'}</option>
              {matches.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.email}
                </option>
              ))}
            </select>
          </label>

          {userId && (
            <label className="form-field">
              <span>Vehicle</span>
              {cars === null ? (
                <select disabled>
                  <option>Loading cars…</option>
                </select>
              ) : cars.length === 0 ? (
                <span className="muted small field-hint">{customer?.name ?? 'This customer'} hasn't added any cars yet. They add them under Settings → My cars.</span>
              ) : (
                <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                  {!cars.some((c) => !c.status) && <option value="">All of this customer's cars are in use</option>}
                  {cars.map((c) => (
                    <option key={c.id} value={c.id} disabled={Boolean(c.status)}>
                      {c.plate}
                      {c.status ? ` · ${c.status} ${c.spot}` : ''}
                    </option>
                  ))}
                </select>
              )}
            </label>
          )}

          <div className="form-grid reserve-grid">
            <label className="form-field">
              <span>Arrival time</span>
              <input type="datetime-local" value={arrival} min={min} max={max} step={300} onChange={(e) => setArrival(e.target.value)} />
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
              <span>Reserved amount</span>
              <strong>{costCents != null ? money(costCents) : 'Rate not set'}</strong>
            </div>
          </div>
          <p className="muted small reserve-policy">
            Arrival can be up to {rules.maxHoursAhead === 1 ? '1 hour' : `${rules.maxHoursAhead} hours`} ahead. The fee is
            added to the customer's account as pending and processed when they check in. If the car isn't checked in within{' '}
            {rules.graceMinutes} minutes of arrival, the spot is released and the full fee is processed. The reservation appears
            on their Reservations page.
          </p>

          {error && (
            <div className="field-error" role="alert">
              {error}
            </div>
          )}
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Reserving…' : customer ? `Reserve for ${customer.name}` : 'Reserve'}
          </button>
        </form>
      )}
    </dialog>
  );
}

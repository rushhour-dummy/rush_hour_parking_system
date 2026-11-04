import { useEffect, useState } from 'react';
import { checkoutNote, formatHours, money } from '../parking.jsx';
import Modal from './Modal.jsx';

// Check one of your cars in or out. The button follows the chosen car: "Check in"
// for a car that isn't parked, "Check out" once it is. Both ask for confirmation.
// Guests see the form disabled; pressing the button opens the sign-in pop-up.
// variant 'header': compact, in the top bar; messages pop up below it and fade.
// Check-in needs a reservation: a car without one gets a notice to reserve a spot first.
export default function CheckInForm({ signedIn, cars, spots, levelName, onCheckIn, onCheckOut, onAddCar, onReserve, variant }) {
  const [plate, setPlate] = useState('');
  const [confirm, setConfirm] = useState(null); // 'in' | 'out'
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  const [needsSpot, setNeedsSpot] = useState(false); // no reserved spot for this car

  // Keep a valid car selected as the list changes: a reserved car first, then a free one.
  useEffect(() => {
    if (!cars.some((c) => c.plate === plate)) {
      const pick = cars.find((c) => c.status === 'reserved') ?? cars.find((c) => !c.status) ?? cars[0];
      setPlate(pick?.plate ?? '');
    }
  }, [cars]); // eslint-disable-line react-hooks/exhaustive-deps

  // In the header, the success message hides itself after a few seconds.
  useEffect(() => {
    if (!done || variant !== 'header') return undefined;
    const t = setTimeout(() => setDone(''), 6000);
    return () => clearTimeout(t);
  }, [done, variant]);

  const car = cars.find((c) => c.plate === plate);
  const parked = car?.status === 'parked';
  const spotOf = (code) => spots.find((s) => s.id === code);

  function handleSubmit(e) {
    e.preventDefault();
    if (!signedIn) return onCheckIn(); // opens the sign-in pop-up
    if (!car) return setError('Add a car first.');
    setError('');
    setDone('');
    setNeedsSpot(false);
    if (!parked && car.status !== 'reserved') {
      setNeedsSpot(true);
      return setError(`No spot selected for ${car.plate}. Reserve a spot first, then check in.`);
    }
    setConfirm(parked ? 'out' : 'in');
  }

  async function confirmed() {
    setBusy(true);
    try {
      if (confirm === 'in') {
        const r = await onCheckIn(plate);
        setDone(
          r.chargedCents
            ? `${plate} checked in to ${r.spot}. ${money(r.chargedCents)} was processed for your reservation.`
            : `${plate} checked in to ${r.spot}.`
        );
      } else {
        const spot = car.spot;
        await onCheckOut(spot);
        setDone(`${plate} checked out of ${spot}.`);
      }
      setConfirm(null);
    } catch (err) {
      setError(err.message); // e.g. no free spots on this level
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  }

  const label = (c) =>
    c.status === 'parked' ? `${c.plate} · parked in ${c.spot}` : c.status === 'reserved' ? `${c.plate} · reserved ${c.spot}` : `${c.plate} · no spot reserved`;

  // What the confirmation says.
  let body = null;
  if (confirm === 'in' && car) {
    const reserved = car.status === 'reserved' ? spotOf(car.spot) : null;
    body = reserved ? (
      <>
        <p style={{ margin: 0 }}>
          Check in <span className="mono">{car.plate}</span> to its reserved spot <span className="mono">{car.spot}</span>?
        </p>
        <div className="reserve-summary">
          <div className="reserve-cost">
            <span>Payment processed now</span>
            <strong>{money(reserved.reservedAmountCents)}</strong>
          </div>
          {reserved.reservedHours && <div className="muted small">Your reserved {formatHours(reserved.reservedHours)}, starting now.</div>}
        </div>
      </>
    ) : (
      <>
        <p style={{ margin: 0 }}>
          Check in <span className="mono">{car.plate}</span> on {levelName}? It takes the first open spot.
        </p>
        <div className="reserve-summary">
          <div className="reserve-cost">
            <span>Payment processed now</span>
            <strong>{money(0)}</strong>
          </div>
          <div className="muted small">No reservation, so there's no fee to process at check-in.</div>
        </div>
      </>
    );
  }
  if (confirm === 'out' && car) {
    const note = checkoutNote(spotOf(car.spot));
    body = (
      <>
        <p style={{ margin: 0 }}>
          Check out <span className="mono">{car.plate}</span> from <span className="mono">{car.spot}</span>? The spot becomes open.
        </p>
        {note && <div className="detail-warning" style={{ marginTop: 0 }}>{note}</div>}
      </>
    );
  }

  return (
    <form className={`checkin${variant === 'header' ? ' checkin-header' : ''}`} onSubmit={handleSubmit} noValidate aria-label="Check in or out">
      <div className="checkin-row">
        {signedIn && cars.length === 0 ? (
          <div className="checkin-empty">
            No cars saved yet.{' '}
            <button type="button" className="btn-inline" onClick={onAddCar}>
              Add a car
            </button>
          </div>
        ) : (
          <label className="field field-select">
            <span className="field-label">Car</span>
            <select
              value={plate}
              disabled={!signedIn}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'checkin-error' : undefined}
              onChange={(e) => {
                setPlate(e.target.value);
                setError('');
                setDone('');
                setNeedsSpot(false);
              }}
            >
              {!signedIn && <option value="">Sign in to check in</option>}
              {cars.map((c) => (
                <option key={c.id} value={c.plate}>
                  {label(c)}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="submit"
          className={`${parked ? 'btn-danger' : 'btn-primary'} checkin-btn`}
          disabled={busy || (signedIn && cars.length === 0)}
        >
          <span className="only-desktop">{parked ? 'Check out' : '+ Check in vehicle'}</span>
          <span className="only-mobile">{parked ? 'Check out' : 'Check in'}</span>
        </button>
      </div>
      {(error || done) && (
        <div className={variant === 'header' ? 'checkin-toast' : undefined}>
          {error && (
            <div id="checkin-error" className="field-error" role="alert">
              {error}
              {needsSpot && onReserve && (
                <>
                  {' '}
                  <button
                    type="button"
                    className="btn-inline"
                    onClick={() => {
                      setError('');
                      setNeedsSpot(false);
                      onReserve();
                    }}
                  >
                    Reserve a spot
                  </button>
                </>
              )}
            </div>
          )}
          {done && (
            <div className="form-ok checkin-done" role="status">
              {done}
            </div>
          )}
          {variant === 'header' && (
            <button type="button" className="notice-close" aria-label="Dismiss" onClick={() => { setError(''); setDone(''); setNeedsSpot(false); }}>
              ×
            </button>
          )}
        </div>
      )}

      <Modal open={Boolean(confirm)} title={confirm === 'out' ? 'Check out?' : 'Check in?'} onClose={() => !busy && setConfirm(null)}>
        {body}
        <div className="confirm-actions">
          <button type="button" className={`${confirm === 'out' ? 'btn-danger' : 'btn-primary'} btn-pad`} disabled={busy} onClick={confirmed}>
            {busy ? 'Working…' : confirm === 'out' ? 'Yes, check out' : 'Yes, check in'}
          </button>
          <button type="button" className="btn-outline btn-pad" disabled={busy} onClick={() => setConfirm(null)}>
            Cancel
          </button>
        </div>
      </Modal>
    </form>
  );
}

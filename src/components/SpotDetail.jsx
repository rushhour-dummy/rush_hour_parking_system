import { useState } from 'react';
import { STATUS_LABEL } from '../data.js';
import { checkoutNote, formatHours, money } from '../parking.jsx';
import ConfirmModal from './ConfirmModal.jsx';

// The selected spot. Anyone can reserve a free spot; only the person whose car
// it is can cancel a reservation or check out.
export default function SpotDetail({ spot, id, onReserve, onRelease }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false); // check-out
  const [cancelling, setCancelling] = useState(false); // cancel reservation
  const status = spot?.status ?? 'free';
  const mine = Boolean(spot?.mine);

  async function run(action) {
    setError('');
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  let detail;
  if (status === 'free') detail = <>Open now. Reserve it to hold it for one of your cars.</>;
  else if (status === 'reserved' && mine) {
    detail = (
      <>
        Held for <span className="mono">{spot.plate}</span>
        {spot.reservedFor && (
          <>
            , arriving {spot.reservedFor}
            {spot.reservedHours ? ` for ${formatHours(spot.reservedHours)}` : ''}.
          </>
        )}
        {spot.holdUntil && (
          <span className="detail-warning">
            Check in by {spot.holdUntil}, or the spot is released and you're charged{' '}
            {money(spot.reservedAmountCents)}.
          </span>
        )}
      </>
    );
  } else if (status === 'reserved') detail = <>Held for another driver's reservation.</>;
  else if (mine) {
    detail = (
      <>
        Your car <span className="mono">{spot.plate}</span> has been parked here since {spot.since}.
      </>
    );
  } else detail = <>Occupied.</>;

  return (
    <section className="card detail" aria-label="Selected spot" aria-live="polite">
      <div className="muted small">Selected spot</div>
      <div className="detail-head">
        <div className="detail-id">{id}</div>
        <div className={`badge badge-${status}`}>{mine ? `${STATUS_LABEL[status]} · yours` : STATUS_LABEL[status]}</div>
      </div>
      <div className="muted detail-text">{detail}</div>
      {status === 'free' && (
        <button type="button" className="btn-primary" onClick={onReserve}>
          Reserve this spot
        </button>
      )}
      {status === 'reserved' && mine &&
        (cancelling ? (
          <div className="confirm-box" role="group" aria-label="Confirm cancellation">
            <span>
              Cancel the reservation for <span className="mono">{spot.plate}</span> at {id}?
            </span>
            {spot.reservedAmountCents > 0 && (
              <span className="muted small">The pending {money(spot.reservedAmountCents)} fee is cancelled and the spot opens up for others.</span>
            )}
            <div className="confirm-actions">
              <button
                type="button"
                className="btn-danger btn-pad"
                disabled={busy}
                onClick={() => run(onRelease).then(() => setCancelling(false))}
              >
                Yes, cancel it
              </button>
              <button type="button" className="btn-outline btn-pad" disabled={busy} onClick={() => setCancelling(false)}>
                Keep reservation
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn-outline" disabled={busy} onClick={() => setCancelling(true)}>
            Cancel reservation
          </button>
        ))}
      {status === 'occupied' && mine && (
        <button type="button" className="btn-danger" disabled={busy} onClick={() => setConfirming(true)}>
          Check out
        </button>
      )}
      <ConfirmModal
        open={confirming && status === 'occupied' && mine}
        title="Check out?"
        confirmLabel="Yes, check out"
        cancelLabel="Keep parked"
        danger
        onClose={() => setConfirming(false)}
        onConfirm={onRelease}
      >
        <p style={{ margin: 0 }}>
          Check out <span className="mono">{spot?.plate}</span> from <span className="mono">{id}</span>? The spot becomes open.
        </p>
        {checkoutNote(spot) && (
          <div className="detail-warning" style={{ marginTop: 0 }}>
            {checkoutNote(spot)}
          </div>
        )}
      </ConfirmModal>
      {error && (
        <div className="field-error" role="alert">
          {error}
        </div>
      )}
    </section>
  );
}

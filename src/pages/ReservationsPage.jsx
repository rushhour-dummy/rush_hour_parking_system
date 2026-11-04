import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { checkoutNote, durationOptions, formatHours, formatTime, money, priceCents, useParkingStore } from '../parking.jsx';
import { useSettings } from '../settings.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';

// Customers: cars parked now (spot, check-in and expiry; add time, check out),
// current reservations (check in, add time, cancel) and past ones.

const OUTCOME = {
  checked_in: { label: 'Checked in', badge: 'badge-free' },
  cancelled: { label: 'Cancelled', badge: 'badge-neutral' },
  cancelled_by_admin: { label: 'Cancelled by the lot', badge: 'badge-neutral' },
  no_show: { label: 'Missed', badge: 'badge-reserved' },
  ended: { label: 'Ended', badge: 'badge-neutral' },
};

export default function ReservationsPage({ onOpenView }) {
  const { settings } = useSettings();
  const { refresh: refreshSpots, hourlyRate, rules, allSpots, floors, checkIn, releaseSpot, addTime, changes } = useParkingStore();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const tf = settings.timeFormat;

  const load = useCallback(async () => {
    try {
      setData(await api('/me/reservations'));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, []);

  // Reload after any change, including Check in / Check out in the header.
  useEffect(() => {
    load();
  }, [load, changes]);
  // Fresh spot data too, so "Parked now" matches the lot when the page opens.
  useEffect(() => {
    refreshSpots();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function afterChange() {
    await Promise.all([load(), refreshSpots()]);
  }

  const current = data?.reservations.filter((r) => r.status === 'active') ?? [];
  const parked = allSpots.filter((s) => s.mine && s.status === 'occupied');

  // Check-in and check-out also change this page's lists.
  const doCheckIn = async (plate) => {
    const r = await checkIn(plate);
    await load();
    return r;
  };
  const doCheckOut = async (code) => {
    await releaseSpot(code);
    await load();
  };
  const past = data?.reservations.filter((r) => r.status !== 'active') ?? [];

  return (
    <div className="page-stack">
      <header>
        <div className="muted small">Account</div>
        <h1>Reservations</h1>
      </header>

      <section className="card form-card" aria-labelledby="parked-title">
        <h2 id="parked-title">Parked now</h2>
        {parked.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            None of your cars are checked in.
          </p>
        ) : (
          <div className="parked-list">
            {parked.map((s) => (
              <ParkedCar
                key={s.id}
                spot={s}
                levelName={floors.find((f) => f.code === s.level)?.name ?? s.level}
                rate={hourlyRate}
                maxHours={rules.maxHours}
                tf={tf}
                onAddTime={(hours) => addTime(s.id, hours)}
                onCheckOut={() => doCheckOut(s.id)}
              />
            ))}
          </div>
        )}
      </section>
      {error && (
        <div className="field-error" role="alert">
          {error}
        </div>
      )}

      <section className="card form-card" aria-labelledby="current-title">
        <h2 id="current-title">Current</h2>
        {data && current.length === 0 && (
          <div className="res-empty">
            <p className="muted" style={{ margin: 0 }}>
              You have no active reservations.
            </p>
            <button type="button" className="btn-outline btn-pad" onClick={() => onOpenView('spots')}>
              Reserve a spot
            </button>
          </div>
        )}
        {current.map((r) => (
          <CurrentReservation
            key={r.id}
            r={r}
            tf={tf}
            rate={hourlyRate}
            maxHours={data.maxHours}
            graceMinutes={rules.graceMinutes}
            onChanged={afterChange}
            onCheckIn={doCheckIn}
          />
        ))}
      </section>

      <section className="card form-card" aria-labelledby="past-title">
        <h2 id="past-title">Past</h2>
        {data && past.length === 0 && (
          <p className="muted" style={{ margin: 0 }}>
            No past reservations.
          </p>
        )}
        {past.length > 0 && (
          <ul className="res-list">
            {past.map((r) => {
              const o = OUTCOME[r.status] ?? OUTCOME.ended;
              return (
                <li key={r.id}>
                  <div>
                    <div className="res-title">
                      <span className="mono">{r.spot}</span>
                      {r.plate && (
                        <>
                          {' · '}
                          <span className="mono">{r.plate}</span>
                        </>
                      )}
                    </div>
                    <div className="muted small">
                      {r.arrival ? `Arrival ${formatTime(r.arrival, tf)}` : `Held ${formatTime(r.bookedAt, tf)}`}
                      {r.hours ? ` · ${formatHours(r.hours)}` : ''}
                      {r.amountCents != null ? ` · ${money(r.amountCents)} reserved` : ''}
                    </div>
                  </div>
                  <div className="res-right">
                    <span className={`badge ${o.badge}`}>{o.label}</span>
                    {r.status === 'no_show' && r.chargedCents != null && (
                      <span className="muted small">Charged {money(r.chargedCents)}</span>
                    )}
                    {r.status === 'checked_in' && r.chargedCents != null && (
                      <span className="muted small">{money(r.chargedCents)} processed at check-in</span>
                    )}
                    {(r.status === 'cancelled' || r.status === 'cancelled_by_admin') && r.chargeStatus === 'waived' && (
                      <span className="muted small">Not charged</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function CurrentReservation({ r, tf, rate, maxHours, graceMinutes, onChanged, onCheckIn }) {
  const room = r.hours ? maxHours - r.hours : 0; // hours that can still be added
  const [extra, setExtra] = useState(Math.min(1, room) || 0.25);
  // Keep the choice valid when the reservation gets longer.
  useEffect(() => {
    if (room > 0 && extra > room) setExtra(Math.min(1, room));
  }, [room]); // eslint-disable-line react-hooks/exhaustive-deps
  const [dialog, setDialog] = useState(null); // 'checkin' | 'time' | 'cancel'
  const [note, setNote] = useState('');
  const deadline = r.arrival ? new Date(new Date(r.arrival).getTime() + graceMinutes * 60000).toISOString() : null;
  const extraCost = priceCents(rate, extra);

  // Runs the confirmed action; errors stay in the pop-up (ConfirmModal shows them).
  const act = (action, done) => async () => {
    setNote('');
    try {
      const result = await action();
      if (done) setNote(done(result));
    } finally {
      await onChanged();
    }
  };

  return (
    <article className="res-current" aria-label={`Reservation for spot ${r.spot}`}>
      <div className="res-current-head">
        <div>
          <div className="res-spot mono">{r.spot}</div>
          <div className="muted small">
            {r.plate && <span className="mono">{r.plate}</span>}
            {r.plate && ' · '}Booked {formatTime(r.bookedAt, tf)}
          </div>
        </div>
        <span className="badge badge-reserved">Holding</span>
      </div>

      <dl className="res-facts">
        <div>
          <dt>Arrival</dt>
          <dd>{r.arrival ? formatTime(r.arrival, tf) : '—'}</dd>
        </div>
        <div>
          <dt>Length</dt>
          <dd>{r.hours ? formatHours(r.hours) : '—'}</dd>
        </div>
        <div>
          <dt>Fee (pending)</dt>
          <dd className="mono">{money(r.amountCents)}</dd>
        </div>
      </dl>
      {deadline && (
        <div className="detail-warning" style={{ marginTop: 0 }}>
          Check in by {formatTime(deadline, tf)}, or the spot is released and you're charged {money(r.amountCents)}.
        </div>
      )}

      <button type="button" className="btn-primary btn-pad res-checkin" onClick={() => setDialog('checkin')}>
        Check in vehicle
      </button>

      <div className="res-actions">
        {r.hours && room > 0 ? (
          <div className="res-extend">
            <label className="form-field res-extend-field">
              <span>Add time</span>
              <select value={extra} onChange={(e) => setExtra(Number(e.target.value))}>
                {durationOptions(room).map((h) => (
                  <option key={h} value={h}>
                    +{formatHours(h)}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="btn-primary btn-pad" onClick={() => setDialog('time')}>
              {extraCost != null ? `Add for ${money(extraCost)}` : 'Add time'}
            </button>
          </div>
        ) : (
          r.hours && <span className="muted small">This reservation is at the {maxHours}-hour maximum.</span>
        )}
        <button type="button" className="btn-outline btn-pad" onClick={() => setDialog('cancel')}>
          Cancel reservation
        </button>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        The fee is pending on your account and processed when you check in. Adding time raises it but doesn't change your arrival time. Cancelling before the check-in deadline is free.
      </p>
      {note && (
        <div className="form-ok" role="status">
          {note}
        </div>
      )}

      <ConfirmModal
        open={dialog === 'checkin'}
        title="Check in?"
        confirmLabel="Yes, check in"
        cancelLabel="Not yet"
        onClose={() => setDialog(null)}
        onConfirm={act(() => onCheckIn(r.plate))}
      >
        <p style={{ margin: 0 }}>
          Check in <span className="mono">{r.plate}</span> to its reserved spot <span className="mono">{r.spot}</span>?
        </p>
        <div className="reserve-summary">
          <div className="reserve-cost">
            <span>Payment processed now</span>
            <strong>{money(r.amountCents)}</strong>
          </div>
          {r.hours && <div className="muted small">Your reserved {formatHours(r.hours)}, starting now.</div>}
        </div>
      </ConfirmModal>

      <ConfirmModal
        open={dialog === 'time'}
        title="Add time to this reservation?"
        confirmLabel={`Yes, add ${formatHours(extra)}`}
        onClose={() => setDialog(null)}
        onConfirm={act(
          () => api(`/me/reservations/${r.id}/extend`, { method: 'POST', body: { hours: extra } }),
          (d) => `Added ${formatHours(extra)}. Now ${formatHours(d.hours)} for ${money(d.amountCents)}.`
        )}
      >
        <p style={{ margin: 0 }}>
          Add {formatHours(extra)} to your reservation at <span className="mono">{r.spot}</span>?
        </p>
        <div className="reserve-summary">
          <div className="reserve-cost">
            <span>Length of stay</span>
            <strong>
              {formatHours(r.hours)} → {formatHours(r.hours + extra)}
            </strong>
          </div>
          <div className="reserve-cost">
            <span>Fee (pending)</span>
            <strong>
              {money(r.amountCents)} → {money((r.amountCents ?? 0) + (extraCost ?? 0))}
            </strong>
          </div>
          <div className="muted small">Still pending: it's processed when you check in. Your arrival time doesn't change.</div>
        </div>
      </ConfirmModal>

      <ConfirmModal
        open={dialog === 'cancel'}
        title="Cancel this reservation?"
        confirmLabel="Yes, cancel it"
        cancelLabel="Keep reservation"
        danger
        onClose={() => setDialog(null)}
        onConfirm={act(() => api(`/me/reservations/${r.id}/cancel`, { method: 'POST' }), () => 'Reservation cancelled.')}
      >
        <p style={{ margin: 0 }}>
          Cancel the reservation for <span className="mono">{r.plate}</span> at <span className="mono">{r.spot}</span>?
        </p>
        {r.amountCents > 0 && <p className="muted small" style={{ margin: 0 }}>The pending {money(r.amountCents)} fee is cancelled and the spot opens up for others.</p>}
      </ConfirmModal>
    </article>
  );
}

// A car I have parked: spot, check-in and expiry, plus add time (processed now)
// and check out. Both ask first in a pop-up.
function ParkedCar({ spot: s, levelName, rate, maxHours, tf, onAddTime, onCheckOut }) {
  const [hours, setHours] = useState(1);
  const [dialog, setDialog] = useState(null); // 'time' | 'out'
  const [note, setNote] = useState('');
  const cost = priceCents(rate, hours);
  const passed = s.paidUntilMs && s.paidUntilMs < Date.now();
  const newUntil = new Date(Math.max(s.paidUntilMs ?? Date.now(), Date.now()) + hours * 3600000).toISOString();
  const leaving = checkoutNote(s);

  return (
    <article className="res-current" aria-label={`Parked at ${s.id}`}>
      <div className="res-current-head">
        <div>
          <div className="res-spot mono">{s.id}</div>
          <div className="muted small">
            <span className="mono">{s.plate}</span> · {levelName}
          </div>
        </div>
        <span className="badge badge-occupied">Parked</span>
      </div>
      <dl className="res-facts">
        <div>
          <dt>Checked in</dt>
          <dd>{s.since || '—'}</dd>
        </div>
        <div>
          <dt>Expires</dt>
          <dd className={passed ? 'expired' : undefined}>{s.paidUntil ? (passed ? `${s.paidUntil} (passed)` : s.paidUntil) : 'No time limit'}</dd>
        </div>
      </dl>

      <div className="res-actions">
        <div className="res-extend">
          <label className="form-field res-extend-field">
            <span>Add time</span>
            <select value={hours} onChange={(e) => setHours(Number(e.target.value))}>
              {durationOptions(maxHours).map((h) => (
                <option key={h} value={h}>
                  +{formatHours(h)}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn-primary btn-pad" onClick={() => { setNote(''); setDialog('time'); }}>
            {cost != null ? `Add for ${money(cost)}` : 'Add time'}
          </button>
        </div>
        <button type="button" className="btn-danger btn-pad" onClick={() => { setNote(''); setDialog('out'); }}>
          Check out
        </button>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        Added time is charged right away and moves your expiry later{passed ? ' (counted from now, since your paid time has passed)' : ''}.
      </p>
      {note && (
        <div className="form-ok" role="status">
          {note}
        </div>
      )}

      <ConfirmModal
        open={dialog === 'time'}
        title="Add time?"
        confirmLabel={`Yes, add ${formatHours(hours)}`}
        onClose={() => setDialog(null)}
        onConfirm={async () => {
          const r = await onAddTime(hours);
          setNote(`Added ${formatHours(hours)}. Paid until ${formatTime(r.paidUntil, tf)}; ${money(r.amountCents)} processed.`);
        }}
      >
        <p style={{ margin: 0 }}>
          Add {formatHours(hours)} for <span className="mono">{s.plate}</span> at <span className="mono">{s.id}</span>?
        </p>
        <div className="reserve-summary">
          <div className="reserve-cost">
            <span>Expires</span>
            <strong>
              {s.paidUntil && !passed ? `${s.paidUntil} → ` : ''}
              {formatTime(newUntil, tf)}
            </strong>
          </div>
          <div className="reserve-cost">
            <span>Processed now</span>
            <strong>{money(cost)}</strong>
          </div>
          {rate != null && (
            <div className="muted small">
              {formatHours(hours)} × {money(Math.round(rate * 100))}/h. Added time isn't refunded if you leave early.
            </div>
          )}
        </div>
      </ConfirmModal>

      <ConfirmModal
        open={dialog === 'out'}
        title="Check out?"
        confirmLabel="Yes, check out"
        cancelLabel="Keep parked"
        danger
        onClose={() => setDialog(null)}
        onConfirm={async () => {
          await onCheckOut();
        }}
      >
        <p style={{ margin: 0 }}>
          Check out <span className="mono">{s.plate}</span> from <span className="mono">{s.id}</span>? The spot becomes open.
        </p>
        {leaving && (
          <div className="detail-warning" style={{ marginTop: 0 }}>
            {leaving}
          </div>
        )}
      </ConfirmModal>
    </article>
  );
}

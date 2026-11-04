import { useMemo, useState } from 'react';
import AdminReserveDialog from '../components/AdminReserveDialog.jsx';
import Modal from '../components/Modal.jsx';
import { AddTimeDialog, EditReservationDialog } from '../components/StaffSpotDialogs.jsx';
import { formatHours, money, useParkingStore } from '../parking.jsx';

const LABEL = { free: 'Open', reserved: 'Reserved', occupied: 'Occupied' };

// Columns shown in each list. Open spots have no car or customer to show.
const FULL = ['spot', 'level', 'status', 'vehicle', 'customer', 'email', 'time', 'expires'];
const COLUMN_LABEL = { spot: 'Spot', level: 'Level', status: 'Status', vehicle: 'Vehicle', customer: 'Customer', email: 'Email', time: 'Time', expires: 'Expires' };

const VIEWS = {
  all: {
    columns: FULL,
    title: 'All spots',
    blurb: 'Every spot on every level.',
    empty: 'No spots match these filters.',
    match: () => true,
  },
  reservations: {
    columns: FULL,
    title: 'Reservations',
    blurb: 'Reserved and occupied spots.',
    empty: 'No reserved or occupied spots match these filters.',
    match: (s) => s.status === 'reserved' || s.status === 'occupied',
  },
  open: {
    columns: ['spot', 'level', 'status'],
    title: 'Open spots',
    blurb: 'Spots open to park in right now.',
    empty: 'No open spots match these filters.',
    match: (s) => s.status === 'free',
  },
};

// Reserved and occupied spots are ended with an admin status change (with Undo).
const END = {
  reserved: { label: 'Cancel reservation', done: 'reservation cancelled' },
  occupied: { label: 'Check out', done: 'checked out' },
};

export default function AdminPage({ filter }) {
  const { allSpots, totals, floors, setSpotStatus, reopenSession, adminReserve, staffEditReservation, staffAddTime } = useParkingStore();
  const [level, setLevel] = useState('all');
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState(null);
  const [reserving, setReserving] = useState(null); // spot code while the pop-up is open
  const [dialog, setDialog] = useState(null); // { type: 'checkout' | 'cancel' | 'edit' | 'addTime', spot }
  const [busy, setBusy] = useState(false);
  const view = VIEWS[filter] ?? VIEWS.all;
  const levelName = (code) => floors.find((f) => f.code === code)?.name ?? code;

  const inView = useMemo(() => allSpots.filter(view.match), [allSpots, view]);
  const rows = useMemo(() => {
    const q = query.trim().toUpperCase();
    return inView.filter(
      (s) =>
        (level === 'all' || s.level === level) &&
        (!q ||
          s.id.includes(q) ||
          s.plate.toUpperCase().includes(q) ||
          s.customerName.toUpperCase().includes(q) ||
          s.customerEmail.toUpperCase().includes(q))
    );
  }, [inView, level, query]);

  async function end(spot) {
    const a = END[spot.status];
    try {
      const r = await setSpotStatus(spot.id, 'free', null);
      setNotice({
        text: `${spot.id} ${a.done}.`,
        // Reopens the original reservation or stay, with its times and price.
        undo: r.endedSessionId
          ? async () => {
              try {
                await reopenSession(r.endedSessionId);
                setNotice(null);
              } catch (err) {
                setNotice({ text: err.message, error: true });
              }
            }
          : null,
      });
    } catch (err) {
      setNotice({ text: err.message, error: true });
    }
  }

  async function reserve(details) {
    const r = await adminReserve(reserving, details); // errors are shown in the pop-up
    const code = reserving;
    setNotice({
      text: `${r.spot} reserved for ${r.customer} (${r.plate}), ${money(r.amountCents)}.`,
      undo: async () => {
        try {
          await setSpotStatus(code, 'free', null);
          setNotice(null);
        } catch (err) {
          setNotice({ text: err.message, error: true });
        }
      },
    });
  }

  const stats = [
    ['Total spots', totals.total],
    ['Open', totals.free],
    ['Reserved', totals.reserved],
    ['Occupied', totals.occupied],
  ];

  const open = (type, spot) => () => setDialog({ type, spot });
  const action = (s) => {
    if (s.status === 'free') {
      return (
        <button type="button" className="btn-primary btn-sm" aria-label={`Reserve spot ${s.id} for a customer`} onClick={() => setReserving(s.id)}>
          Reserve for customer
        </button>
      );
    }
    if (s.status === 'reserved') {
      return (
        <div className="row-actions">
          {s.hasDeadline && (
            <button type="button" className="btn-outline btn-sm" aria-label={`Edit reservation, spot ${s.id}`} onClick={open('edit', s)}>
              Edit
            </button>
          )}
          <button type="button" className="btn-outline btn-sm" aria-label={`Cancel reservation, spot ${s.id}`} onClick={open('cancel', s)}>
            Cancel
          </button>
        </div>
      );
    }
    return (
      <div className="row-actions">
        <button type="button" className="btn-outline btn-sm" aria-label={`Add time, spot ${s.id}`} onClick={open('addTime', s)}>
          Add time
        </button>
        <button type="button" className="btn-danger btn-sm" aria-label={`Check out, spot ${s.id}`} onClick={open('checkout', s)}>
          Check out
        </button>
      </div>
    );
  };

  // Reserved: when the hold is released if the car doesn't check in (arrival + grace).
  // Occupied: when the paid time runs out.
  const expires = (s) => {
    if (s.status === 'reserved') return s.hasDeadline ? `${s.holdUntil}` : 'No expiry (staff hold)';
    if (s.status === 'occupied') return s.paidUntil ? `paid until ${s.paidUntil}` : '—';
    return '—';
  };
  const cell = {
    spot: (s) => <td className="mono">{s.id}</td>,
    level: (s) => <td className="cell-level">{levelName(s.level)}</td>,
    status: (s) => (
      <td>
        <span className={`badge badge-${s.status}`}>{LABEL[s.status]}</span>
      </td>
    ),
    vehicle: (s) => <td className="mono">{s.plate || '—'}</td>,
    customer: (s) => <td className="cell-wrap cell-customer">{s.customerName || '—'}</td>,
    email: (s) => <td className="cell-email cell-email-wrap">{s.customerEmail || '—'}</td>,
    time: (s) => <td className="cell-wrap">{s.timeLabel || '—'}</td>,
    expires: (s) => <td className={`cell-wrap${(s.status === 'reserved' && s.hasDeadline) || s.paidUntil ? ' cell-expires' : ''}`}>{expires(s)}</td>,
  };

  return (
    <div className="page-stack admin">
      <header>
        <div className="muted small">Administration</div>
        <h1>{view.title}</h1>
        <p className="muted admin-blurb">{view.blurb}</p>
      </header>

      <section className="summary" aria-label="All levels">
        {stats.map(([label, value]) => (
          <div key={label} className="card stat">
            <div className="stat-label">{label}</div>
            <div className="stat-value">{value}</div>
          </div>
        ))}
      </section>

      <section className="card admin-list" aria-labelledby="admin-list-title">
        <div className="admin-toolbar">
          <h2 id="admin-list-title">
            Showing {rows.length} of {inView.length}
          </h2>
          <div className="admin-filters">
            <label className="form-field inline-field">
              <span>Level</span>
              <select value={level} onChange={(e) => setLevel(e.target.value)}>
                <option value="all">All levels</option>
                {floors.map((f) => (
                  <option key={f.code} value={f.code}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field inline-field">
              <span>Search</span>
              <input type="search" placeholder="Spot, plate or customer" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
          </div>
        </div>

        {notice && (
          <div className={`admin-notice${notice.error ? ' is-error' : ''}`} role={notice.error ? 'alert' : 'status'}>
            <span>{notice.text}</span>
            {notice.undo && (
              <button type="button" className="btn-inline" onClick={notice.undo}>
                Undo
              </button>
            )}
            <button type="button" className="notice-close" aria-label="Dismiss" onClick={() => setNotice(null)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        )}

        {rows.length === 0 ? (
          <div className="admin-empty">{view.empty}</div>
        ) : (
          <>
            <div className="table-wrap only-desktop-block">
              <table>
                <thead>
                  <tr>
                    {view.columns.map((c) => (
                      <th key={c}>{COLUMN_LABEL[c]}</th>
                    ))}
                    <th>
                      <span className="sr-only">Action</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => (
                    <tr key={s.id}>
                      {view.columns.map((c) => (
                        <Cell key={c} render={cell[c]} spot={s} />
                      ))}
                      <td className="cell-action">{action(s)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="admin-cards only-mobile-block">
              {rows.map((s) => (
                <li key={s.id} className="admin-card">
                  <div className="admin-card-top">
                    <span className="mono admin-card-id">{s.id}</span>
                    <span className={`badge badge-${s.status}`}>{LABEL[s.status]}</span>
                  </div>
                  <div className="muted small">
                    {levelName(s.level)}
                    {s.plate && ` · ${s.plate}`}
                    {s.customerName && ` · ${s.customerName}`}
                    {s.timeLabel && ` · ${s.timeLabel}`}
                  </div>
                  {s.customerEmail && <div className="muted small">{s.customerEmail}</div>}
                  {s.status !== 'free' && expires(s) !== '—' && <div className="small">Expires: {expires(s)}</div>}
                  {action(s)}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <AdminReserveDialog open={Boolean(reserving)} spotCode={reserving} onClose={() => setReserving(null)} onReserve={reserve} />

      {/* Check-out and cancellation both ask first. */}
      <Modal
        open={dialog?.type === 'checkout' || dialog?.type === 'cancel'}
        title={dialog?.type === 'cancel' ? 'Cancel this reservation?' : 'Check out this car?'}
        onClose={() => !busy && setDialog(null)}
      >
        {dialog && (dialog.type === 'checkout' || dialog.type === 'cancel') && (
          <>
            <p style={{ margin: 0 }}>
              {dialog.type === 'cancel' ? 'Cancel the reservation for ' : 'Check out '}
              <span className="mono">{dialog.spot.plate || 'the car'}</span> {dialog.type === 'cancel' ? 'at' : 'from'}{' '}
              <span className="mono">{dialog.spot.id}</span>
              {dialog.spot.customerName ? ` (${dialog.spot.customerName})` : ''}? The spot becomes open.
            </p>
            {dialog.type === 'cancel' && dialog.spot.reservedAmountCents > 0 && (
              <p className="muted small" style={{ margin: 0 }}>
                The pending {money(dialog.spot.reservedAmountCents)} fee is cancelled. You can undo this right after.
              </p>
            )}
            {dialog.type === 'checkout' && dialog.spot.timeLabel && (
              <p className="muted small" style={{ margin: 0 }}>
                Parked {dialog.spot.timeLabel}
                {dialog.spot.paidUntil ? `, paid until ${dialog.spot.paidUntil}. Unused paid time isn't refunded.` : '.'}
              </p>
            )}
            <div className="confirm-actions">
              <button
                type="button"
                className="btn-danger btn-pad"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await end(dialog.spot);
                  setBusy(false);
                  setDialog(null);
                }}
              >
                {busy ? 'Working…' : dialog.type === 'cancel' ? 'Yes, cancel it' : 'Yes, check out'}
              </button>
              <button type="button" className="btn-outline btn-pad" disabled={busy} onClick={() => setDialog(null)}>
                {dialog.type === 'cancel' ? 'Keep reservation' : 'Cancel'}
              </button>
            </div>
          </>
        )}
      </Modal>

      <EditReservationDialog
        spot={dialog?.type === 'edit' ? dialog.spot : null}
        onClose={() => setDialog(null)}
        onSave={async (changes) => {
          const r = await staffEditReservation(dialog.spot.id, changes);
          setNotice({ text: `${r.spot} updated: ${formatHours(r.hours)}, fee ${money(r.amountCents)} (pending).` });
        }}
      />
      <AddTimeDialog
        spot={dialog?.type === 'addTime' ? dialog.spot : null}
        onClose={() => setDialog(null)}
        onSave={async (hours) => {
          const r = await staffAddTime(dialog.spot.id, hours);
          setNotice({ text: `${r.spot}: added ${formatHours(hours)}. ${money(r.amountCents)} processed.` });
        }}
      />
    </div>
  );
}

function Cell({ render, spot }) {
  return render(spot);
}

import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { formatHours, formatTime, money } from '../parking.jsx';
import { useSettings } from '../settings.jsx';

// Admin only: everything that happened in the lot, newest first — reservations,
// time changes, cancellations, added time, check-ins and -outs, no-shows and
// changes to the lot itself.

const TYPES = [
  { key: '', label: 'All activity' },
  { key: 'reserved', label: 'Reservations made' },
  { key: 'edited', label: 'Time changes' },
  { key: 'time', label: 'Time added' },
  { key: 'cancelled', label: 'Cancellations' },
  { key: 'checkin', label: 'Check-ins' },
  { key: 'checkout', label: 'Check-outs' },
  { key: 'noshow', label: 'No-shows' },
  { key: 'lot', label: 'Lot changes' },
];
const BADGE = {
  reserved: ['Reservation', 'badge-reserved'],
  edited: ['Time change', 'badge-info'],
  time: ['Time added', 'badge-info'],
  cancelled: ['Cancelled', 'badge-neutral'],
  checkin: ['Check-in', 'badge-occupied'],
  checkout: ['Check-out', 'badge-neutral'],
  noshow: ['No-show', 'badge-danger'],
  lot: ['Lot', 'badge-neutral'],
  other: ['Other', 'badge-neutral'],
};
const RANGES = [
  { key: 'all', label: 'Any time' },
  { key: 'today', label: 'Today' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
];

function rangeStart(key) {
  if (key === 'today') {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  if (key === '7d' || key === '30d') return new Date(Date.now() - (key === '7d' ? 7 : 30) * 86400000).toISOString();
  return '';
}

const hoursText = (h) => formatHours(h);

// Turns the stored details into one readable line (times in the viewer's zone).
function describe(e, tf) {
  const d = e.details;
  if (!d) return '';
  const t = (iso) => (iso ? formatTime(iso, tf) : 'none');
  const parts = [];
  if (d.customer && e.category === 'reserved') parts.push(`for ${d.customer}`);
  if (Array.isArray(d.arrival)) {
    if (d.arrival[0] !== d.arrival[1] && t(d.arrival[0]) !== t(d.arrival[1])) parts.push(`arrival ${t(d.arrival[0])} → ${t(d.arrival[1])}`);
  } else if (d.arrival) parts.push(`arrives ${t(d.arrival)}`);
  if (Array.isArray(d.hours)) {
    if (d.hours[0] !== d.hours[1]) parts.push(`${hoursText(d.hours[0])} → ${hoursText(d.hours[1])}`);
  } else if (d.hours) parts.push(hoursText(d.hours));
  if (Array.isArray(d.fee) && d.fee[0] !== d.fee[1]) parts.push(`fee ${money(d.fee[0])} → ${money(d.fee[1])}`);
  if (Array.isArray(d.paidUntil)) parts.push(`paid until ${d.paidUntil[0] ? `${t(d.paidUntil[0])} → ` : ''}${t(d.paidUntil[1])}`);
  if (Array.isArray(d.level)) parts.push(`${d.level[0]} → ${d.level[1]}`);
  else if (d.level) parts.push(d.level);
  if (d.codes?.length) parts.push(d.codes.join(', '));
  else if (d.spots) parts.push(`${d.spots} ${d.spots === 1 ? 'spot' : 'spots'}`);
  if (d.changed?.length) {
    const names = { hourlyRate: 'hourly rate', lotName: 'lot name', address: 'address' };
    parts.push(d.changed.map((k) => names[k] ?? k).join(', '));
  }
  if (d.note) parts.push(d.note);
  return parts.join(' · ');
}

export default function ActivitiesPage() {
  const { settings } = useSettings();
  const tf = settings.timeFormat;
  const [type, setType] = useState('');
  const [range, setRange] = useState('7d');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState(''); // what was sent (debounced)
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ entries: [], total: 0, hasMore: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (type) params.set('type', type);
      if (search) params.set('q', search);
      const from = rangeStart(range);
      if (from) params.set('from', from);
      setData(await api(`/admin/activity?${params}`));
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [type, range, search, page]);

  useEffect(() => {
    load();
  }, [load]);

  // New filters start again from the first page.
  const pick = (setter) => (value) => {
    setter(value);
    setPage(1);
  };

  const who = (e) => (e.by ? `${e.by.name}${e.by.role && e.by.role !== 'customer' ? ` (${e.by.role})` : ''}` : 'System');
  const first = data.total ? (page - 1) * 50 + 1 : 0;
  const last = (page - 1) * 50 + data.entries.length;

  return (
    <div className="page-stack admin">
      <header className="page-header">
        <div>
          <div className="muted small">Administration</div>
          <h1>Activities</h1>
          <p className="muted admin-blurb">Reservations, time changes, cancellations, added time and everything else in the lot.</p>
        </div>
        <button type="button" className="btn-outline btn-pad" onClick={load} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </header>

      <div className="chip-row" role="group" aria-label="Type of activity">
        {TYPES.map((t) => (
          <button key={t.key} type="button" className={`chip${type === t.key ? ' is-active' : ''}`} aria-pressed={type === t.key} onClick={() => pick(setType)(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <section className="card admin-list" aria-labelledby="activity-title">
        <div className="admin-toolbar">
          <h2 id="activity-title">{data.total ? `Showing ${first}–${last} of ${data.total}` : 'No activity'}</h2>
          <div className="admin-filters">
            <label className="form-field inline-field">
              <span>When</span>
              <select value={range} onChange={(e) => pick(setRange)(e.target.value)}>
                {RANGES.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field inline-field">
              <span>Search</span>
              <input type="search" placeholder="Spot, plate or person" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} />
            </label>
          </div>
        </div>

        {error && (
          <div className="admin-notice is-error" role="alert">
            <span>{error}</span>
          </div>
        )}

        {!data.entries.length ? (
          <div className="admin-empty">{loading ? 'Loading…' : 'Nothing matches these filters.'}</div>
        ) : (
          <>
            <div className="table-wrap only-desktop-block">
              <table className="activity-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Type</th>
                    <th>Activity</th>
                    <th>Spot</th>
                    <th>Vehicle</th>
                    <th>Customer</th>
                    <th>Done by</th>
                    <th className="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.entries.map((e) => {
                    const [label, badge] = BADGE[e.category] ?? BADGE.other;
                    const detail = describe(e, tf);
                    return (
                      <tr key={e.id}>
                        <td className="mono cell-nowrap">{formatTime(e.time, tf)}</td>
                        <td>
                          <span className={`badge ${badge}`}>{label}</span>
                        </td>
                        <td className="cell-activity">
                          <div>{e.event}</div>
                          {detail && <div className="muted small">{detail}</div>}
                        </td>
                        <td className="mono">{e.spot ?? '—'}</td>
                        <td className="mono">{e.plate ?? '—'}</td>
                        <td>
                          {e.customer ? (
                            <>
                              <div>{e.customer.name}</div>
                              {e.customer.email && <div className="muted small">{e.customer.email}</div>}
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>{who(e)}</td>
                        <td className="num mono">{e.amountCents != null ? money(e.amountCents) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <ul className="admin-cards only-mobile-block">
              {data.entries.map((e) => {
                const [label, badge] = BADGE[e.category] ?? BADGE.other;
                const detail = describe(e, tf);
                return (
                  <li key={e.id} className="admin-card">
                    <div className="admin-card-top">
                      <span className={`badge ${badge}`}>{label}</span>
                      <span className="mono muted small">{formatTime(e.time, tf)}</span>
                    </div>
                    <div>{e.event}</div>
                    {detail && <div className="muted small">{detail}</div>}
                    <div className="muted small">
                      {[e.spot, e.plate, e.customer?.name, `by ${who(e)}`].filter(Boolean).join(' · ')}
                      {e.amountCents != null && ` · ${money(e.amountCents)}`}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {(page > 1 || data.hasMore) && (
          <div className="pager">
            <button type="button" className="btn-outline btn-sm" disabled={page === 1 || loading} onClick={() => setPage((p) => p - 1)}>
              Newer
            </button>
            <span className="muted small">Page {page}</span>
            <button type="button" className="btn-outline btn-sm" disabled={!data.hasMore || loading} onClick={() => setPage((p) => p + 1)}>
              Older
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

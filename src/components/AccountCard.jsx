import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { formatTime, money } from '../parking.jsx';

// Payments page: the balance on this user's account and every transaction
// recorded against it. No payment provider is connected yet, so charges stay
// Pending until check-in, then Processed; Cancelled if the reservation is cancelled.
export default function AccountCard({ timeFormat }) {
  const [account, setAccount] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/me/account')
      .then(setAccount)
      .catch((err) => setError(err.message));
  }, []);

  const STATUS = { pending: 'Pending', processed: 'Processed', failed: 'Failed', cancelled: 'Cancelled' };
  const title = (t) =>
    t.type === 'charge' ? (t.reason === 'no_show' ? 'Missed reservation' : t.reason === 'extension' ? 'Extra time' : 'Reservation payment') : t.type[0].toUpperCase() + t.type.slice(1);

  return (
    <section className="card form-card" aria-labelledby="account-title">
      <div className="charges-head">
        <h2 id="account-title">Balance and transactions</h2>
        {account && (
          <div className="account-balance">
            <span className="muted small">Pending</span>
            <span className="charges-total">{money(account.balanceCents)}</span>
          </div>
        )}
      </div>
      <p className="muted small balance-note">
        Reserving a spot adds its fee here as pending. It's processed when you check in (or if you miss the reservation), and
        cancelled if you cancel.
      </p>
      {error && <div className="field-error" role="alert">{error}</div>}
      {account && account.transactions.length === 0 && <p className="muted" style={{ margin: 0 }}>No transactions yet.</p>}
      {account && account.transactions.length > 0 && (
        <ul className="charge-list">
          {account.transactions.map((t) => (
            <li key={t.id}>
              <div>
                <div className="charge-title">{title(t)}</div>
                <div className="muted small">
                  {[t.spot, t.plate && <span key="p" className="mono">{t.plate}</span>, t.reservedFor && `arrival ${formatTime(t.reservedFor, timeFormat)}`]
                    .filter(Boolean)
                    .reduce((acc, part, i) => (i ? [...acc, ' · ', part] : [part]), [])}
                </div>
                <div className="muted small">
                  {formatTime(t.createdAt, timeFormat)} · Transaction #{t.id}
                </div>
              </div>
              <div className="charge-right">
                <div className="charge-amount">
                  {t.amountCents >= 0 ? '+' : '−'}
                  {money(Math.abs(t.amountCents))}
                </div>
                <span className={`badge ${t.status === 'processed' ? 'badge-free' : t.status === 'failed' ? 'badge-occupied' : t.status === 'cancelled' ? 'badge-neutral' : 'badge-reserved'}`}>
                  {STATUS[t.status]}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

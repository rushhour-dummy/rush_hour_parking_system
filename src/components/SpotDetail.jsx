import { STATUS_LABEL, STATUS_DETAIL } from '../data.js';

export default function SpotDetail({ id, status, onReserve, onRelease }) {
  return (
    <section className="card">
      <div className="detail-head">
        <span className="detail-id">{id}</span>
        <span className={`badge badge-${status}`}>{STATUS_LABEL[status]}</span>
      </div>
      <p className="muted">{STATUS_DETAIL[status]}</p>
      <div className="detail-actions">
        <button type="button" className="btn-primary" onClick={onReserve} disabled={status !== 'free'}>
          Reserve
        </button>
        <button type="button" className="btn-outline" onClick={onRelease} disabled={status === 'free'}>
          {status === 'reserved' ? 'Cancel hold' : 'Check out'}
        </button>
      </div>
    </section>
  );
}
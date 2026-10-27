import { STATUS_DETAIL, STATUS_LABEL } from '../data.js';

export default function SpotDetail({ id, status, onReserve, onRelease }) {
  return (
    <section className="card detail" aria-label="Selected spot" aria-live="polite">
      <div className="muted small">Selected spot</div>
      <div className="detail-head">
        <div className="detail-id">{id}</div>
        <div className={`badge badge-${status}`}>{STATUS_LABEL[status]}</div>
      </div>
      <div className="muted">{STATUS_DETAIL[status]}</div>
      {status === 'free' ? (
        <button type="button" className="btn-primary" onClick={onReserve}>
          Reserve this spot
        </button>
      ) : (
        <button type="button" className="btn-outline" onClick={onRelease}>
          Check out / release
        </button>
      )}
    </section>
  );
}

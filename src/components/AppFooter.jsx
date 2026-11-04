// Desktop footer: lot details and the reservation rules everyone parks under.
export default function AppFooter({ lotName, address, rules }) {
  const year = new Date().getFullYear();
  const ahead = rules.maxHoursAhead === 1 ? '1 hour' : `${rules.maxHoursAhead} hours`;
  return (
    <footer className="app-footer">
      <div className="footer-col">
        <div className="footer-brand">
          <span className="brand-mark footer-mark" aria-hidden="true">R</span>
          <span>RushHourParkingSystem</span>
        </div>
        <div className="muted small">© {year} RushHourParkingSystem. All rights reserved.</div>
      </div>
      {(lotName || address) && (
        <div className="footer-col">
          <div className="footer-title">{lotName || 'Our lot'}</div>
          {address && <div className="muted small">{address}</div>}
        </div>
      )}
      <div className="footer-col">
        <div className="footer-title">Reservations</div>
        <div className="muted small">
          Book up to {ahead} ahead, for 1–{rules.maxHours} hours. Check in within {rules.graceMinutes} minutes of your arrival time.
        </div>
      </div>
    </footer>
  );
}

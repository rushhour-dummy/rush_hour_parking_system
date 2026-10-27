export default function ActivityLog({ entries }) {
  return (
    <section id="activity" className="card activity" aria-label="Recent activity">
      <h2>Recent activity</h2>

      {/* Desktop: table */}
      <div className="table-wrap only-desktop-block">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Plate</th>
              <th>Spot</th>
              <th>Event</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((r, i) => (
              <tr key={`${r.time}-${r.spot}-${i}`}>
                <td className="mono">{r.time}</td>
                <td className="mono">{r.plate}</td>
                <td>{r.spot}</td>
                <td>{r.event}</td>
                <td>{r.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: stacked list */}
      <ul className="activity-list only-mobile-block">
        {entries.map((r, i) => (
          <li key={`${r.time}-${r.spot}-${i}`}>
            <div>
              <div className="mono">{r.plate}</div>
              <div className="muted small">{r.event} · {r.spot}</div>
            </div>
            <div className="activity-right">
              <div className="mono muted small">{r.time}</div>
              <div className="small">{r.amount}</div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function ActivityLog({ entries }) {
  return (
    <section id="activity" className="card">
      <h2>Recent activity</h2>

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
            {entries.map((e, i) => (
              <tr key={`${e.time}-${e.spot}-${i}`}>
                <td className="mono">{e.time}</td>
                <td className="mono">{e.plate}</td>
                <td className="mono">{e.spot}</td>
                <td>{e.event}</td>
                <td className="mono">{e.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="activity-list only-mobile-block">
        {entries.map((e, i) => (
          <li key={`${e.time}-${e.spot}-${i}`}>
            <div>
              <div className="mono">{e.plate}</div>
              <div className="muted small">{e.event} · {e.spot}</div>
            </div>
            <div className="activity-right">
              <span className="mono">{e.time}</span>
              <span className="muted small">{e.amount}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
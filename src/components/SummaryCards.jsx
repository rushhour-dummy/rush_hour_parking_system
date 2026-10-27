export default function SummaryCards({ level, counts, rate }) {
  const levelName = `Level ${level.slice(1)}`;
  const cards = [
    { label: `Available on ${levelName}`, value: counts.free },
    { label: 'Occupied', value: counts.occupied },
    { label: 'Reserved', value: counts.reserved },
    { label: 'Hourly rate', value: rate ? `$${rate}` : '[$/HR]', small: !rate },
  ];

  return (
    <section className="summary" aria-label="Summary">
      {cards.map((c) => (
        <div key={c.label} className="card stat">
          <div className="stat-label">{c.label}</div>
          <div className={`stat-value${c.small ? ' stat-value-sm' : ''}`}>{c.value}</div>
        </div>
      ))}
    </section>
  );
}

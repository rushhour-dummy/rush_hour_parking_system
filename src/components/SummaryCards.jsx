export default function SummaryCards({ level, counts }) {
  const total = counts.free + counts.occupied + counts.reserved;

  const stats = [
    { label: `Free on ${level}`, value: counts.free },
    { label: `Occupied on ${level}`, value: counts.occupied },
    { label: `Reserved on ${level}`, value: counts.reserved },
    { label: `Total spots on ${level}`, value: total },
  ];

  return (
    <section className="summary" aria-label="Summary">
      {stats.map((s) => (
        <div key={s.label} className="card stat">
          <div className="stat-label">{s.label}</div>
          <div className="stat-value">{s.value}</div>
        </div>
      ))}
    </section>
  );
}
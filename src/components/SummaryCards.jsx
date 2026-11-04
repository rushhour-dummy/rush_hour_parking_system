// `floors` + `onLevelChange` add arrows to the Available card to step between levels.
export default function SummaryCards({ level, levelName: name, counts, rate, showReserved = true, floors = [], onLevelChange }) {
  const levelName = name || level;
  const cards = [
    { label: `Available on ${levelName}`, value: counts.free, levels: true },
    // Without a Reserved card, held spots count as occupied so the numbers add up.
    { label: 'Occupied', value: showReserved ? counts.occupied : counts.occupied + counts.reserved },
    ...(showReserved ? [{ label: 'Reserved', value: counts.reserved }] : []),
    { label: 'Hourly rate', value: rate != null ? `$${rate.toFixed(2)}` : 'Not set', small: rate == null },
  ];

  return (
    <section className="summary" aria-label="Summary">
      {cards.map((c) => (
        <div key={c.label} className="card stat">
          {c.levels && floors.length > 1 && onLevelChange ? (
            <LevelStepper floors={floors} level={level} label={c.label} onChange={onLevelChange} />
          ) : (
            <div className="stat-label">{c.label}</div>
          )}
          <div className={`stat-value${c.small ? ' stat-value-sm' : ''}`}>{c.value}</div>
        </div>
      ))}
    </section>
  );
}

function LevelStepper({ floors, level, label, onChange }) {
  const i = Math.max(0, floors.findIndex((f) => f.code === level));
  const go = (step) => onChange(floors[(i + step + floors.length) % floors.length].code);
  return (
    <div className="stat-label level-stepper">
      <span aria-live="polite">{label}</span>
      <span className="stepper-btns">
        <button type="button" className="stepper-btn" aria-label="Previous level" onClick={() => go(-1)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
        </button>
        <button type="button" className="stepper-btn" aria-label="Next level" onClick={() => go(1)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
        </button>
      </span>
    </div>
  );
}

export default function SpotGrid({ levels, level, onLevelChange, spots, selected, onSelect }) {
  return (
    <section id="spots" className="card spots" aria-label="Spot map">
      <div className="card-head">
        <h2>Spots</h2>
        <div role="group" aria-label="Level" className="level-tabs">
          {/* levels: [{ code, name }] — admins can add, rename and remove them. */}
          {levels.map((lv) => (
            <button
              key={lv.code}
              type="button"
              className={`level-btn${lv.code === level ? ' is-active' : ''}`}
              aria-pressed={lv.code === level}
              aria-label={lv.name}
              onClick={() => onLevelChange(lv.code)}
            >
              <span className="only-desktop">{lv.name}</span>
              <span className="only-mobile">{lv.code}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="spot-grid">
        {spots.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`spot spot-${s.status}${s.id === selected ? ' is-selected' : ''}${s.mine ? ' is-mine' : ''}`}
            aria-label={`Spot ${s.id}, ${s.status}${s.mine ? ', yours' : ''}`}
            aria-pressed={s.id === selected}
            onClick={() => onSelect(s.id)}
          >
            {String(s.number ?? s.id.split('-')[1]).padStart(2, '0')}
          </button>
        ))}
      </div>

      <div className="legend">
        <span><i className="swatch spot-free" />Open</span>
        <span><i className="swatch spot-occupied" />Occupied</span>
        <span><i className="swatch spot-reserved" />Reserved</span>
        {spots.some((s) => s.mine) && (
          <span><i className="swatch swatch-mine" />Your car</span>
        )}
      </div>
    </section>
  );
}

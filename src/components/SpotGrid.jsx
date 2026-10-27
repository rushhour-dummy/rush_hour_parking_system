import { LEVELS } from '../data.js';

export default function SpotGrid({ level, onLevelChange, spots, selected, onSelect }) {
  return (
    <section id="spots" className="card spots" aria-label="Spot map">
      <div className="card-head">
        <h2>Spots</h2>
        <div role="group" aria-label="Level" className="level-tabs">
          {LEVELS.map((lv) => (
            <button
              key={lv}
              type="button"
              className={`level-btn${lv === level ? ' is-active' : ''}`}
              aria-pressed={lv === level}
              aria-label={`Level ${lv.slice(1)}`}
              onClick={() => onLevelChange(lv)}
            >
              <span className="only-desktop">Level {lv.slice(1)}</span>
              <span className="only-mobile">{lv}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="spot-grid">
        {spots.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`spot spot-${s.status}${s.id === selected ? ' is-selected' : ''}`}
            aria-label={`Spot ${s.id}, ${s.status}`}
            aria-pressed={s.id === selected}
            onClick={() => onSelect(s.id)}
          >
            {s.id.slice(3)}
          </button>
        ))}
      </div>

      <div className="legend">
        <span><i className="swatch spot-free" />Free</span>
        <span><i className="swatch spot-occupied" />Occupied</span>
        <span><i className="swatch spot-reserved" />Reserved</span>
      </div>
    </section>
  );
}

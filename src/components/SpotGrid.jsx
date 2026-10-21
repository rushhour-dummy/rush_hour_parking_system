import { LEVELS, STATUS_LABEL } from '../data.js';

export default function SpotGrid({ level, onLevelChange, spots, selected, onSelect }) {
  return (
    <section id="spots" className="card spots">
      <div className="card-head">
        <h2>Spots · {level}</h2>
        <div className="level-tabs" role="tablist" aria-label="Level">
          {LEVELS.map((l) => (
            <button
              key={l}
              type="button"
              role="tab"
              aria-selected={l === level}
              className={`level-btn${l === level ? ' is-active' : ''}`}
              onClick={() => onLevelChange(l)}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="spot-grid">
        {spots.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`spot spot-${s.status}${selected === s.id ? ' is-selected' : ''}`}
            aria-label={`Spot ${s.id}, ${STATUS_LABEL[s.status]}`}
            aria-pressed={selected === s.id}
            onClick={() => onSelect(s.id)}
          >
            {s.id.split('-')[1]}
          </button>
        ))}
      </div>

      <div className="legend">
        <span><i className="swatch swatch-free" /> Free</span>
        <span><i className="swatch swatch-occupied" /> Occupied</span>
        <span><i className="swatch swatch-reserved" /> Reserved</span>
      </div>
    </section>
  );
}
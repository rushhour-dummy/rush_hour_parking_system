import { useState } from 'react';

export default function CheckInForm({ onCheckIn }) {
  const [plate, setPlate] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    const value = plate.trim().toUpperCase();
    if (!value) {
      setError('Enter a plate number first.');
      return;
    }
    const spot = onCheckIn(value);
    if (spot === undefined) return; // signed out: the sign-in pop-up opened instead
    if (!spot) {
      setError('No free spots on this level.');
      return;
    }
    setPlate('');
    setError('');
  }

  return (
    <form className="checkin" onSubmit={handleSubmit} noValidate>
      <div className="checkin-row">
        <label className="field">
          <span className="field-label">Plate</span>
          <input
            type="text"
            placeholder="ABC-1234"
            value={plate}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'checkin-error' : undefined}
            onChange={(e) => {
              setPlate(e.target.value);
              if (error) setError('');
            }}
          />
        </label>
        <button type="submit" className="btn-primary checkin-btn">
          <span className="only-desktop">+ Check in vehicle</span>
          <span className="only-mobile">Check in</span>
        </button>
      </div>
      {error && (
        <div id="checkin-error" className="field-error" role="alert">
          {error}
        </div>
      )}
    </form>
  );
}

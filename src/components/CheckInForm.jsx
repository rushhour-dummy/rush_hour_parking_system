import { useState } from 'react';

export default function CheckInForm({ onCheckIn }) {
  const [plate, setPlate] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(event) {
    event.preventDefault();
    const value = plate.trim().toUpperCase();
    if (!value) {
      setError('Enter a plate number.');
      return;
    }
    const spot = onCheckIn(value);
    if (!spot) {
      setError('No free spots on this level.');
      return;
    }
    setError('');
    setPlate('');
  }

  return (
    <form className="checkin" onSubmit={handleSubmit}>
      <div className="checkin-row">
        <label className="field">
          <span className="field-label">Plate</span>
          <input
            type="text"
            value={plate}
            onChange={(e) => setPlate(e.target.value)}
            placeholder="ABC-1234"
            autoComplete="off"
          />
        </label>
        <button type="submit" className="btn-primary checkin-btn">Check in</button>
      </div>
      {error && <div className="field-error" role="alert">{error}</div>}
    </form>
  );
}
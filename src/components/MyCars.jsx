import { useState } from 'react';
import { useParkingStore } from '../parking.jsx';

// Settings → My cars: the plates you can pick when checking in or reserving.
export default function MyCars() {
  const { myVehicles, addVehicle, removeVehicle } = useParkingStore();
  const [plate, setPlate] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleAdd(e) {
    e.preventDefault();
    if (!plate.trim()) return setError('Enter a plate number.');
    setBusy(true);
    setError('');
    try {
      await addVehicle(plate.trim());
      setPlate('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(car) {
    setError('');
    try {
      await removeVehicle(car.id);
    } catch (err) {
      setError(err.message);
    }
  }

  const statusText = (c) =>
    c.status === 'parked' ? `Parked in ${c.spot}` : c.status === 'reserved' ? `Reserved ${c.spot}${c.reservedFor ? ` for ${c.reservedFor}` : ''}` : '';

  return (
    <section id="my-cars" className="card form-card" aria-labelledby="my-cars-title">
      <div>
        <h2 id="my-cars-title">My cars</h2>
        <p className="muted small" style={{ margin: '4px 0 0' }}>
          Add your plates here, then pick one when you check in or reserve. Each car can hold one spot at a time.
        </p>
      </div>

      {myVehicles.length > 0 && (
        <ul className="car-list">
          {myVehicles.map((c) => (
            <li key={c.id}>
              <span className="mono car-plate">{c.plate}</span>
              {c.status && <span className={`badge badge-${c.status === 'parked' ? 'occupied' : 'reserved'}`}>{statusText(c)}</span>}
              <button
                type="button"
                className="btn-link car-remove"
                disabled={Boolean(c.status)}
                title={c.status ? 'Check out or cancel before removing this car.' : undefined}
                aria-label={`Remove ${c.plate}`}
                onClick={() => handleRemove(c)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <form className="car-add" onSubmit={handleAdd} noValidate>
        <label className="form-field car-add-field">
          <span>Plate number</span>
          <input
            type="text"
            placeholder="ABC-1234"
            maxLength={16}
            autoComplete="off"
            value={plate}
            onChange={(e) => {
              setPlate(e.target.value);
              setError('');
            }}
          />
        </label>
        <button type="submit" className="btn-primary btn-pad" disabled={busy}>
          {busy ? 'Adding…' : 'Add car'}
        </button>
      </form>
      {error && (
        <div className="field-error" role="alert">
          {error}
        </div>
      )}
    </section>
  );
}

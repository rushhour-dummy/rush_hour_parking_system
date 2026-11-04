/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { spotId } from './data.js';

const API = import.meta.env.VITE_API_URL ?? ''; // Base URL for the API, with a fallback to an empty string if not defined.

// Makes an API request to the specified path with the given options. Throws an error if the request fails.
async function api(path, options) {
  // Constructs the full URL for the API request using the base URL and the specified path.
  const res = await fetch(`${API}/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  // Parses the response body as JSON, defaulting to an empty object if parsing fails.
  const body = await res.json().catch(() => ({}));
  // Throws an error if the response is not OK, including the error message and status code.
  if (!res.ok) {
    const err = new Error(body.error || 'Request failed');
    err.status = res.status;
    throw err;
  }
  // Returns the parsed response body.
  return body;
}

// Formats a date object as a time string according to the specified time format (12h or 24h).
function formatTime(date, timeFormat) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: timeFormat === '12h' });
}

// Custom hook to manage parking lot data, including spots, logs, and user interactions.
export function useParking({ defaultLevel = 'L1', timeFormat = '24h' } = {}) {
  const [spots, setSpots] = useState({});
  const [rawLog, setRawLog] = useState([]);
  const [level, setLevelState] = useState(defaultLevel);
  const [selected, setSelected] = useState(spotId(defaultLevel, 3));
  const [error, setError] = useState('');

  // Refreshes the parking lot data from the API, updating the spots and logs.
  const refresh = useCallback(async () => {
    try {
      const [s, l] = await Promise.all([api('/spots'), api('/log')]);
      setSpots(Object.fromEntries(s.map((r) => [r.id, r.status])));
      setRawLog(l);
      setError('');
    } catch {
      setError('Cannot reach the server.');
    }
  }, []);

  // Effect to refresh the parking lot data on mount and at regular intervals.
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 10000); // picks up other people's changes
    return () => clearInterval(t);
  }, [refresh]);

  // Memoized log of parking events, formatted according to the specified time format.
  const log = useMemo(
    () =>
      rawLog.map((r) => ({
        time: formatTime(new Date(r.created_at), timeFormat),
        plate: r.plate ?? '—',
        spot: r.spot,
        event: r.event,
        amount: r.amount ?? '—',
      })),
    [rawLog, timeFormat]
  );

  // Memoized list of spots for the current level, including their status.
  const levelSpots = useMemo(
    () => Object.keys(spots).filter((id) => id.startsWith(`${level}-`)).map((id) => ({ id, status: spots[id] })),
    [spots, level]
  );

  // Memoized counts of spots by status for the current level.
  const counts = useMemo(() => {
    const c = { free: 0, occupied: 0, reserved: 0 };
    levelSpots.forEach((s) => c[s.status]++);
    return c;
  }, [levelSpots]);

  // Updates the current level and resets the selected spot to the first spot of the new level.
  function setLevel(next) {
    setLevelState(next);
    setSelected(spotId(next, 1));
  }

  // Changes the status of the selected spot, updating the server and refreshing the local data.
  async function changeStatus(status) {
    try {
      await api(`/spots/${selected}/status`, { method: 'POST', body: JSON.stringify({ status }) });
    } catch (e) {
      setError(e.message);
    }
    await refresh();
  }

  // Checks in a vehicle to the selected spot, returning the spot id or null if the level is full. Other failures throw.
  async function checkIn(plate) {
    try {
      const { id } = await api('/checkin', { method: 'POST', body: JSON.stringify({ level, plate }) });
      setSelected(id);
      await refresh();
      return id;
    } catch (e) {
      // Handle the specific case where the level is full (409 Conflict).
      if (e.status === 409) {
        await refresh();
        return null;
      }
      throw e;
    }
  }

  // Returns the current state and functions for managing the parking lot, including level, spots, logs, and user actions.
  return {
    level,
    setLevel,
    levelSpots,
    counts,
    log,
    error,
    selected,
    selectedStatus: spots[selected] ?? 'free',
    select: setSelected,
    reserve: () => changeStatus('reserved'),
    release: () => changeStatus('free'),
    checkIn,
  };
}
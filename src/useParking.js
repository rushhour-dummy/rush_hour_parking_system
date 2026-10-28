/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { spotId } from './data.js';

const API = import.meta.env.VITE_API_URL ?? '';

async function api(path, options) {
  const res = await fetch(`${API}/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || 'Request failed');
    err.status = res.status;
    throw err;
  }
  return body;
}

function formatTime(date, timeFormat) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: timeFormat === '12h' });
}

export function useParking({ defaultLevel = 'L1', timeFormat = '24h' } = {}) {
  const [spots, setSpots] = useState({});
  const [rawLog, setRawLog] = useState([]);
  const [level, setLevelState] = useState(defaultLevel);
  const [selected, setSelected] = useState(spotId(defaultLevel, 3));
  const [error, setError] = useState('');

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

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 10000); // picks up other people's changes
    return () => clearInterval(t);
  }, [refresh]);

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

  const levelSpots = useMemo(
    () => Object.keys(spots).filter((id) => id.startsWith(`${level}-`)).map((id) => ({ id, status: spots[id] })),
    [spots, level]
  );

  const counts = useMemo(() => {
    const c = { free: 0, occupied: 0, reserved: 0 };
    levelSpots.forEach((s) => c[s.status]++);
    return c;
  }, [levelSpots]);

  function setLevel(next) {
    setLevelState(next);
    setSelected(spotId(next, 1));
  }

  async function changeStatus(status) {
    try {
      await api(`/spots/${selected}/status`, { method: 'POST', body: JSON.stringify({ status }) });
    } catch (e) {
      setError(e.message);
    }
    await refresh();
  }

  // Resolves to the spot id, or null if the level is full. Other failures throw.
  async function checkIn(plate) {
    try {
      const { id } = await api('/checkin', { method: 'POST', body: JSON.stringify({ level, plate }) });
      setSelected(id);
      await refresh();
      return id;
    } catch (e) {
      if (e.status === 409) {
        await refresh();
        return null;
      }
      throw e;
    }
  }

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
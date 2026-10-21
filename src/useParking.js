import { useMemo, useState } from 'react';
import { buildInitialSpots, INITIAL_LOG, spotId } from './data.js';

function nowTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function useParking() {
  const [spots, setSpots] = useState(buildInitialSpots);
  const [log, setLog] = useState(INITIAL_LOG);
  const [level, setLevelState] = useState('L1');
  const [selected, setSelected] = useState('L1-03');

  const levelSpots = useMemo(
    () => Object.keys(spots).filter((id) => id.startsWith(`${level}-`)).map((id) => ({ id, status: spots[id] })),
    [spots, level]
  );

  const counts = useMemo(() => {
    const c = { free: 0, occupied: 0, reserved: 0 };
    levelSpots.forEach((s) => c[s.status]++);
    return c;
  }, [levelSpots]);

  function addLog(entry) {
    setLog((prev) => [{ time: nowTime(), amount: '—', ...entry }, ...prev].slice(0, 8));
  }

  function setStatus(id, status, event, plate = '[PLATE]') {
    setSpots((prev) => ({ ...prev, [id]: status }));
    addLog({ plate, spot: id, event });
  }

  function setLevel(next) {
    setLevelState(next);
    setSelected(spotId(next, 1));
  }

  function checkIn(plate) {
    const free = levelSpots.find((s) => s.status === 'free');
    if (!free) return null;
    setStatus(free.id, 'occupied', 'Check in', plate);
    setSelected(free.id);
    return free.id;
  }

  return {
    level,
    setLevel,
    levelSpots,
    counts,
    log,
    selected,
    selectedStatus: spots[selected] ?? 'free',
    select: setSelected,
    reserve: () => setStatus(selected, 'reserved', 'Reserved'),
    release: () => setStatus(selected, 'free', 'Check out'),
    checkIn,
  };
}